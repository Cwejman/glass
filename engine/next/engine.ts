// The engine governs. It mounts stores and is asked a handful of verbs: mount, unmount,
// read, subscribe and commit.
//
// The engine holds no holons. Each store keeps its own, with their history and index,
// and says where it stands by its head. So the engine keeps only its mounts, each store
// under a name, subscribed to; and the head each stands at, which moves.
//
// Readers may subscribe to the engine in turn. When a store's head moves, by this engine
// or any other, the head is kept, and the subscribers whose read stood on that store are
// notified again.

import type { Expression, Value } from "../../language/expression.ts";
import type { Head, Problem, Store, Touches } from "../../stores/store.ts";
import { evaluate } from "./read/evaluate.ts";
import type { Change } from "./commit/change.ts";
import { touchesOf, meet } from "./commit/touches.ts";
import { judge } from "./commit/judge.ts";
import { mint } from "./commit/mint.ts";
import { land, type Landed } from "./commit/land.ts";

// A store mounted: the store, whether it is written here, and how the engine stops its
// subscription to it.
export type Mount = { store: Store; write: boolean; unsubscribe: () => void };

// The heads a read stood on: each store it asked, by the name it is mounted under, and
// the head it was read at. A subscriber is notified again when one of these moves, and a
// change made from the read may carry them, to be refused if anything it touches has
// moved since.
export type Heads = Readonly<Record<string, Head | null>>;

export type Answer = { at: Heads } & ({ value: Value } | { problem: string });

export type Committed = Landed | { refused: Problem[] };

// What the engine gives: its verbs, and nothing else.
export type Engine = {
  mount(name: string, store: Store, as?: { write?: boolean }): Promise<void>;
  unmount(name: string): void;
  read(expression: Expression): Promise<Answer>;
  subscribe(expression: Expression, listener: (answer: Answer) => void): () => void;
  commit(change: Change): Promise<Committed>;
};

type Subscriber = { expression: Expression; listener: (answer: Answer) => void; stoodOn: Heads };
type Underway = { touches: Touches; done: Promise<void> };

export function engine(): Engine {
  const mounts = new Map<string, Mount>();
  const heads = new Map<string, Head | null>();
  const subscribers = new Set<Subscriber>();
  const underway = new Set<Underway>();

  // A store mounted under a name and subscribed to: at each move of its head, the head is
  // kept, and the subscribers whose read stood on that store are notified again.
  async function mount(name: string, store: Store, { write = false } = {}) {
    const unsubscribe = await store.subscribe((head) => {
      heads.set(name, head);
      for (const subscriber of subscribers) if (name in subscriber.stoodOn) notify(subscriber);
    });

    mounts.set(name, { store, write, unsubscribe });
  }

  function unmount(name: string) {
    mounts.get(name)?.unsubscribe();
    mounts.delete(name);
    heads.delete(name);
    for (const subscriber of subscribers) if (name in subscriber.stoodOn) notify(subscriber);
  }

  // An expression worked out over the stores at the heads they stand at when the read
  // begins, answered with the heads of the stores it asked.
  async function read(expression: Expression): Promise<Answer> {
    const now: Heads = Object.fromEntries(heads);

    try {
      const { value, asked } = await evaluate(expression, mounts, now);
      return { at: Object.fromEntries(asked.map((name) => [name, now[name]!])), value };
    } catch (problem) {
      return { at: now, problem: String(problem) };
    }
  }

  // A read kept: its listener notified now, and again whenever a store it stood on moves.
  function subscribe(expression: Expression, listener: (answer: Answer) => void) {
    const subscriber: Subscriber = { expression, listener, stoodOn: {} };
    subscribers.add(subscriber);
    notify(subscriber);

    return () => subscribers.delete(subscriber);
  }

  // A change takes its turn among the changes under way that touch what it touches, the
  // rest running at once; then it is judged, its ids given, and landed in its stores.
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

  // A turn: waiting for the changes under way that touch what this one touches, and
  // standing among them until done, so those that meet it later wait for it in turn.
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

  // A subscriber notified of what its read comes to now, and what the read stood on kept
  // for the next move.
  async function notify(subscriber: Subscriber) {
    const answer = await read(subscriber.expression);
    subscriber.stoodOn = answer.at;
    subscriber.listener(answer);
  }

  return { mount, unmount, read, subscribe, commit };
}
