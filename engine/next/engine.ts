// The engine: mount, unmount, read, subscribe and commit.
//
// The engine holds no holons. Each store keeps its own holons, their history and their
// index, and reports where it stands as a head. Stores are started by whoever sets glass
// up, the page for instance, and passed to mount already running, local or reached over
// the wire.
//
// The engine's own thread keeps only what has to be one, seen by every verb: the mounts
// and the current head of each, the subscriptions and the heads each stood on, and the
// changes under way. All other work is done by workers (worker.ts), started on the
// runtime the engine is given: workers() for one thread each, or sameThread() for an
// engine on one thread. Every worker is the same and has its own connection to every
// store; it reads, and it takes a commit through judging, minting and offering.
//
// Workers are one pool. Reads and commits each hold at most all but one of them, so a
// burst of either never leaves the other waiting for a worker.
//
// A change waits only for the changes under way that touch the same holons or addresses,
// or put new holons into the root of the same store, strict or not, since one under way
// may yet be refused. It is then judged against the
// field as it stands: refused if it can no longer stand, and, if strict, if anything it
// touches moved since its at.
//
// Anyone can subscribe to a read. When a store's head moves, whoever moved it,
// the engine records the new head and reruns the reads that stood on that store. A store
// that stops is unmounted, and its subscribers are told.

import type { Value } from "../../language/expression.ts";
import type { Runtime } from "../../runtime/runtime.ts";
import type { Head, Holon, Problem, Store, Touches } from "../../stores/store.ts";
import { anotherConnectionTo, disconnect, disconnected } from "../../wire/wire.ts";
import type { EngineWorker } from "./worker.ts";
import type { Change } from "./commit/change.ts";
import { touchesOf, meet, placesInRoot } from "./commit/touches.ts";
import type { Landed } from "./commit/land.ts";

// A mounted store: the store, whether this engine writes to it, and the function that
// ends the engine's subscription to it.
export type Mount = { store: Store; write: boolean; unsubscribe: () => void };

// Heads by mount name. A read answers with the heads of the stores it read, and a
// subscriber is rerun when one of them moves. A change carries the heads it was made
// from, empty when made without reading, and its commit keeps those of the stores it
// touches.
export type Heads = Readonly<Record<string, Head | null>>;

// A read: what it gives, a value with references at any depth, and the holons it carries
// of its own, kept in no store. Each comes under a handle, "~1", as a change's new holons
// do, and is found by it before the stores are asked. Until uses are worked out, what a
// read gives is an expression.
export type Read = { gives: unknown; holons?: Holon[] };

// A read's answer: its value or its problem, the heads it stood on, and the holons it
// found kept differently in two stores, the first store's version answering, where any.
export type Answer = { at: Heads; diverged?: string[] } & ({ value: Value } | { problem: string });

export type Committed = Landed | { refused: Problem[] };

// The engine's public interface.
export type Engine = {
  mount(name: string, store: Store, as?: { write?: boolean }): Promise<void>;
  unmount(name: string): Promise<void>;
  read(read: Read): Promise<Answer>;
  subscribe(read: Read, listener: (answer: Answer) => void): Promise<() => void>;
  commit(change: Change): Promise<Committed>;
};

// What an engine is started with: the runtime its workers run on, and how many to start.
export type Starting = { workers: Runtime; count?: number };

type Work = "read" | "commit";
type Waiting = { work: Work; resolve: (worker: EngineWorker) => void };
// A kept read: what it stood on last, whether it has answered yet, and whether a rerun is
// under way and another is due after it, so its answers come one at a time, in order.
type Subscriber = {
  read: Read;
  listener: (answer: Answer) => void;
  stoodOn: Heads;
  answered: boolean;
  running: boolean;
  again: boolean;
};
type Underway = { touches: Touches; done: Promise<void> };

const workerCode = new URL("./worker.ts", import.meta.url);

const sameHead = (a: Head | null | undefined, b: Head | null | undefined) =>
  (a?.commit ?? null) === (b?.commit ?? null);

export async function engine({ workers: runtime, count = 1 }: Starting): Promise<Engine> {
  const workers = await Promise.all(
    Array.from({ length: count }, () => runtime.run<EngineWorker>(workerCode)),
  );
  const mounts = new Map<string, Mount>();
  const heads = new Map<string, Head | null>();
  const subscribers = new Set<Subscriber>();
  const underway = new Set<Underway>();

  const idle = [...workers];
  const waiting: Waiting[] = [];
  const busy: Record<Work, number> = { read: 0, commit: 0 };
  const most = Math.max(1, count - 1);

  // Mounts a store under a name, gives every worker its own connection to it, and
  // subscribes to its head. Each move records the new head and reruns the subscribers
  // that stood on this store. If the store stops, it is unmounted.
  async function mount(name: string, store: Store, { write = false } = {}) {
    for (const worker of workers) await worker.mount(name, await anotherConnectionTo(store), { write });

    const unsubscribe = await store.subscribe((head) => moved(name, head));

    mounts.set(name, { store, write, unsubscribe });
    disconnected(store).then(() => {
      if (mounts.get(name)?.store === store) void unmount(name);
    });
  }

  // Ends the subscription to the store, and closes every connection to it.
  async function unmount(name: string) {
    const mount = mounts.get(name);
    mounts.delete(name);
    heads.delete(name);

    mount?.unsubscribe();
    if (mount) disconnect(mount.store);
    await Promise.all(workers.map((worker) => worker.unmount(name)));
    for (const subscriber of subscribers) if (stoodOn(subscriber, name)) notify(subscriber);
  }

  // Works the read out on a worker, over every store as it stood when the read began.
  async function read(asked: Read): Promise<Answer> {
    const worker = await take("read");

    try {
      return await worker.read(asked, Object.fromEntries(heads));
    } finally {
      give("read", worker);
    }
  }

  // Keeps a read: its listener is called now, and again whenever a store it read moves.
  async function subscribe(asked: Read, listener: (answer: Answer) => void) {
    const subscriber: Subscriber = {
      read: asked,
      listener,
      stoodOn: {},
      answered: false,
      running: false,
      again: false,
    };
    subscribers.add(subscriber);
    notify(subscriber);

    return () => void subscribers.delete(subscriber);
  }

  // Waits for the changes under way that touch what this one touches, then has a worker
  // judge it against the stores as they stand, mint its ids, and offer it to them.
  async function commit(change: Change): Promise<Committed> {
    const done = await turnAmong(touching(change));
    const worker = await take("commit");

    try {
      const { committed, judgedAt } = await worker.commit(change, Object.fromEntries(heads));

      // Where it landed the store's head is now its commit, unless the store has told of a
      // move the worker did not judge at; so a read after a commit reads it.
      if ("landed" in committed)
        for (const [name, head] of Object.entries(committed.landed))
          if (judgedAt.some((at) => sameHead(heads.get(name), at[name]))) moved(name, head);

      return committed;
    } finally {
      give("commit", worker);
      done();
    }
  }

  // What a change touches, and the root of the store it puts a holon nothing holds into:
  // the store it names, or the only one written.
  function touching(change: Change): Touches {
    const touches = touchesOf(change);
    const written = [...mounts].filter(([, { write }]) => write).map(([name]) => name);
    const into = change.into ?? (written.length === 1 ? written[0] : undefined);
    if (into === undefined || !placesInRoot(change)) return touches;

    return { ...touches, ids: [...touches.ids, `the root of ${into}`] };
  }

  // A store's head moved: recorded, and the reads that stood on that store rerun.
  function moved(name: string, head: Head | null) {
    if (heads.has(name) && sameHead(heads.get(name), head)) return;

    heads.set(name, head);
    for (const subscriber of subscribers) if (stoodOn(subscriber, name)) notify(subscriber);
  }

  // Whether a store's move may change a kept read: one it read, or any, before it first
  // answered.
  const stoodOn = (subscriber: Subscriber, name: string) =>
    !subscriber.answered || name in subscriber.stoodOn;

  // Waits for the changes under way that meet this one, and registers this one so later
  // changes that meet it wait for it. Returns the function that releases them.
  async function turnAmong(touches: Touches) {
    const meeting = [...underway].filter((other) => meet(other.touches, touches));
    const { promise, resolve } = Promise.withResolvers<void>();
    const mine = { touches, done: promise };
    underway.add(mine);

    await Promise.all(meeting.map((other) => other.done));

    return () => {
      underway.delete(mine);
      resolve();
    };
  }

  // A worker for this work as soon as one is free and this work holds fewer than it may.
  function take(work: Work) {
    const { promise, resolve } = Promise.withResolvers<EngineWorker>();
    waiting.push({ work, resolve });
    handOut();
    return promise;
  }

  function give(work: Work, worker: EngineWorker) {
    busy[work]--;
    idle.push(worker);
    handOut();
  }

  // Free workers to whoever has waited longest, among the work that may take one.
  function handOut() {
    for (let i = 0; i < waiting.length && idle.length; ) {
      const { work, resolve } = waiting[i]!;
      if (busy[work] >= most) {
        i++;
        continue;
      }

      waiting.splice(i, 1);
      busy[work]++;
      resolve(idle.pop()!);
    }
  }

  // Reruns a subscriber's read, records which heads it stood on, and calls its listener.
  // While one rerun is under way another is only marked due, and run after it, so the
  // listener hears every answer in order and the last one stands on the latest heads.
  function notify(subscriber: Subscriber) {
    if (subscriber.running) {
      subscriber.again = true;
      return;
    }

    subscriber.running = true;
    void rerun(subscriber);
  }

  // A listener that throws fails on its own: its error is thrown apart, where whoever runs
  // the engine hears of it, and the subscription keeps answering.
  async function rerun(subscriber: Subscriber) {
    try {
      do {
        subscriber.again = false;
        const answer = await read(subscriber.read);
        if (!subscribers.has(subscriber)) return;

        subscriber.stoodOn = answer.at;
        subscriber.answered = true;
        try {
          subscriber.listener(answer);
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
        }
      } while (subscriber.again);
    } finally {
      subscriber.running = false;
    }
  }

  return { mount, unmount, read, subscribe, commit };
}
