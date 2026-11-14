// The engine: mount, unmount, read, subscribe and commit.
//
// The engine holds no holons. Each store keeps its own holons, their history and their
// index, and reports where it stands as a head. Stores are started by whoever sets glass
// up, the page for instance, and passed to mount already running, local or reached over
// the wire. The engine keeps only its mounts, each a store under a name, and the current
// head of each.
//
// Reads run on readers (reader.ts), started on the runtime the engine is given: workers()
// for one thread per reader, or sameThread() for a single-threaded engine. Each reader
// gets its own connection to every store. Commits run on the engine itself, which alone
// knows the changes in progress.
//
// Anyone can subscribe to an expression. When a store's head moves, whoever moved it,
// the engine records the new head and reruns the reads that used that store. A store
// that stops is unmounted, and its subscribers are notified.

import type { Expression, Value } from "../../language/expression.ts";
import type { Runtime } from "../../runtime/runtime.ts";
import type { Head, Problem, Store, Touches } from "../../stores/store.ts";
import { anotherConnectionTo, disconnect, disconnected } from "../../wire/wire.ts";
import type { Reader } from "./reader.ts";
import type { Change } from "./commit/change.ts";
import { touchesOf, meet } from "./commit/touches.ts";
import { judge } from "./commit/judge.ts";
import { mint } from "./commit/mint.ts";
import { land, type Landed } from "./commit/land.ts";

// A mounted store: the store, whether this engine writes to it, and the function that
// ends the engine's subscription to it.
export type Mount = { store: Store; write: boolean; unsubscribe: () => void };

// The head of each store a read used, by mount name. A subscriber is rerun when one of
// these moves. A change can carry them, to be refused if anything it touches has moved
// since.
export type Heads = Readonly<Record<string, Head | null>>;

export type Answer = { at: Heads } & ({ value: Value } | { problem: string });

export type Committed = Landed | { refused: Problem[] };

// The engine's public interface.
export type Engine = {
  mount(name: string, store: Store, as?: { write?: boolean }): Promise<void>;
  unmount(name: string): Promise<void>;
  read(expression: Expression): Promise<Answer>;
  subscribe(expression: Expression, listener: (answer: Answer) => void): Promise<() => void>;
  commit(change: Change): Promise<Committed>;
};

// What an engine is started with: the runtime its readers run on, and how many to start.
export type Starting = { readers: Runtime; count?: number };

type Subscriber = { expression: Expression; listener: (answer: Answer) => void; stoodOn: Heads };
type Underway = { touches: Touches; done: Promise<void> };

const readerCode = new URL("./reader.ts", import.meta.url);

export async function engine({ readers: runtime, count = 1 }: Starting): Promise<Engine> {
  const readers = await Promise.all(Array.from({ length: count }, () => runtime.run<Reader>(readerCode)));
  const mounts = new Map<string, Mount>();
  const heads = new Map<string, Head | null>();
  const subscribers = new Set<Subscriber>();
  const underway = new Set<Underway>();
  const idle = [...readers];
  const waitingForReader: ((reader: Reader) => void)[] = [];

  // Mounts a store under a name, gives every reader its own connection to it, and
  // subscribes to its head. Each move records the new head and reruns the subscribers
  // that read from this store. If the store stops, it is unmounted.
  async function mount(name: string, store: Store, { write = false } = {}) {
    for (const reader of readers) await reader.mount(name, await anotherConnectionTo(store));

    const unsubscribe = await store.subscribe((head) => {
      const before = heads.get(name);
      heads.set(name, head);

      // A head moved by a store's own housekeeping, to the same act, changes no answer.
      if (before && head && before.act === head.act) return;
      for (const subscriber of subscribers) if (name in subscriber.stoodOn) notify(subscriber);
    });

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
    await Promise.all(readers.map((reader) => reader.unmount(name)));
    for (const subscriber of subscribers) if (name in subscriber.stoodOn) notify(subscriber);
  }

  // Runs the read on the first free reader, with every store's head as the read starts.
  // A slow read holds up only its own reader; other reads go to the others.
  async function read(expression: Expression): Promise<Answer> {
    const reader = await freeReader();

    try {
      return await reader.read(expression, Object.fromEntries(heads));
    } finally {
      release(reader);
    }
  }

  // Keeps a read: its listener is called now, and again whenever a store it read moves.
  async function subscribe(expression: Expression, listener: (answer: Answer) => void) {
    const subscriber: Subscriber = { expression, listener, stoodOn: {} };
    subscribers.add(subscriber);
    notify(subscriber);

    return () => void subscribers.delete(subscriber);
  }

  // Waits only for changes in progress that touch the same holons; then judges the change,
  // mints its ids, and writes it to its stores.
  async function commit(change: Change): Promise<Committed> {
    const done = await turnAmong(touchesOf(change));

    try {
      const now: Heads = Object.fromEntries(heads);
      const problems = await judge(change, mounts, now);
      if (problems.length) return { refused: problems };

      return await land(mint(change, mounts, now), mounts);
    } finally {
      done();
    }
  }

  // Waits for the changes in progress that overlap this one, and registers this one so
  // later overlapping changes wait for it. Returns the function that releases them.
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

  // A reader as soon as one is free: at once if one is idle, else when one is released.
  function freeReader() {
    const reader = idle.pop();
    if (reader) return Promise.resolve(reader);
    return new Promise<Reader>((resolve) => waitingForReader.push(resolve));
  }

  // A reader back in the pool: to the read waiting longest, or idle.
  function release(reader: Reader) {
    const next = waitingForReader.shift();
    if (next) next(reader);
    else idle.push(reader);
  }

  // Reruns a subscriber's read, records which heads it used, and calls its listener.
  async function notify(subscriber: Subscriber) {
    const answer = await read(subscriber.expression);
    subscriber.stoodOn = answer.at;
    subscriber.listener(answer);
  }

  return { mount, unmount, read, subscribe, commit };
}
