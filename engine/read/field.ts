// The field as one read sees it: every store the worker has mounted, each at the head
// the read began with. It asks the stores what the read needs, when it needs it, and
// keeps each answer for the rest of the read, so nothing is asked twice; and it records
// which stores were asked, which are the heads the answer stood on.
//
// How a bare id finds the store it lies in is not yet designed, so every store is asked
// for every holon. The holons a read asks for within one turn of the event loop are
// gathered and asked of each store as one question, so a read walking a whole asks once
// a layer rather than once a holon. A holon is read from the first store, in the order
// they were mounted, that keeps it; where another keeps it differently, the holon has
// diverged, and the read says so beside its answer, never choosing in silence.
//
// A read may carry holons of its own, kept in no store, each under a handle. A handle is
// looked up among them, as from the store "read", and never asked of the stores.

import type { Clause, Fact, Head, Holon, Question, Store } from "../../stores/store.ts";
import { isHandle } from "../commit/change.ts";
import type { Heads } from "../engine.ts";
import type { Maybe } from "./maybe.ts";

export type Stores = ReadonlyMap<string, { store: Store }>;

// A holon, and the store it was read from, by mount name.
export type Kept = { holon: Holon; store: string };

// A commit as a store lists it: its content hash, when, what it says, by whom, the heads
// its maker had read, and what it took out.
export type Logged = {
  hash: string;
  when: string;
  says: string;
  by?: string;
  at: [store: string, head: unknown][];
  gone: string[];
};

export type Field = {
  // The names of the stores, in the order they were mounted.
  stores: readonly string[];
  // A holon, at once where the read already holds it.
  holon(id: string): Maybe<Kept | null>;
  // Every store that keeps a holon, in the order they were mounted.
  keepers(id: string): Promise<string[]>;
  // The facts matching a clause, from every store.
  facts(clause: Clause): Promise<Fact[]>;
  // The holons saying a word under a key, as facts, from every store.
  said(a: string, word: string): Promise<Fact[]>;
  // A holon and all it holds, asked of every store as one question each: the holons given.
  whole(id: string): Promise<Holon[]>;
  // The holon a whole holds under a name, in the store the whole is read from.
  address(whole: string, name: string): Promise<string | null>;
  // A store's commits, newest first.
  log(store: string): Promise<Logged[]>;
  // The stores this read asked.
  asked: ReadonlySet<string>;
  // The holons this read found kept differently in two stores.
  diverged: ReadonlySet<string>;
};

const decoder = new TextDecoder();

export function fieldOf(stores: Stores, heads: Heads, carried: readonly Holon[] = []): Field {
  const names = [...stores.keys()];
  const given = new Map(carried.map((holon) => [holon.id, { holon, store: "read" }]));
  const asked = new Set<string>();
  const answers = new Map<string, Promise<unknown[]>>();

  // A store's answer to a question at the read's head, as the values its lines say. A
  // store with no head yet holds nothing; one unmounted since the read began fails it.
  function ask(name: string, question: Question): Promise<unknown[]> {
    asked.add(name);
    const head = heads[name] as Head | null | undefined;
    if (!head) return Promise.resolve([]);
    const mounted = stores.get(name);
    if (!mounted) return Promise.reject(new Error(`the store ${name} was unmounted as it was read`));

    const key = `${name}\u0000${JSON.stringify(question)}`;
    if (!answers.has(key)) answers.set(key, mounted.store.read(head, question).then(linesOf));
    return answers.get(key)!;
  }

  // Every store's answer to a question, each fact once.
  async function everywhere(question: Question) {
    const all = (await Promise.all(names.map((name) => ask(name, question)))).flat() as Fact[];
    const seen = new Set<string>();
    return all.filter((fact) => {
      const key = JSON.stringify(fact);
      return !seen.has(key) && (seen.add(key), true);
    });
  }

  // Each holon as each store keeps it, asked of a store in batches: the holons asked for
  // within one turn are asked of it as one question. What a store gave in answer to a
  // whole is known already, and not asked of it again.
  const keptBy = new Map(names.map((name) => [name, new Map<string, Promise<Holon | undefined>>()]));
  type Waiting = PromiseWithResolvers<Holon | undefined> & { id: string };
  const waiting = new Map<string, Waiting[]>();

  function keptIn(name: string, id: string) {
    const kept = keptBy.get(name)!;
    if (!kept.has(id)) {
      const asking = { ...Promise.withResolvers<Holon | undefined>(), id };
      kept.set(id, asking.promise);
      if (!waiting.size) nextTurn(askWaiting);
      waiting.set(name, [...(waiting.get(name) ?? []), asking]);
    }
    return kept.get(id)!;
  }

  // Every holon asked for this turn, of each store as one question. A store that fails
  // fails every holon of its batch, each read waiting on one told why.
  function askWaiting() {
    const batches = [...waiting];
    waiting.clear();

    for (const [name, batch] of batches)
      (ask(name, { holons: batch.map(({ id }) => id) }) as Promise<Holon[]>).then(
        (holons) => {
          const byId = new Map(holons.map((holon) => [holon.id, holon]));
          for (const { id, resolve } of batch) resolve(byId.get(id));
        },
        (error) => {
          for (const { reject } of batch) reject(error);
        },
      );
  }

  // Each holon asked for, as every store keeps it, by mount order.
  const versions = new Map<string, Promise<(Holon | undefined)[]>>();
  const diverged = new Set<string>();

  function versionsOf(id: string) {
    if (!versions.has(id)) versions.set(id, Promise.all(names.map((name) => keptIn(name, id))));
    return versions.get(id)!;
  }

  // A holon and all it holds, asked of every store as one question each, each store's
  // versions known as it gave them: each holon any gave, as the first to give it keeps it.
  async function whole(id: string): Promise<Holon[]> {
    const answers = (await Promise.all(names.map((name) => ask(name, { whole: { id } })))) as Holon[][];
    const given = new Map<string, Holon>();
    answers.forEach((holons, i) => {
      const kept = keptBy.get(names[i]!)!;
      for (const holon of holons) {
        if (!given.has(holon.id)) given.set(holon.id, holon);
        if (!kept.has(holon.id)) kept.set(holon.id, Promise.resolve(holon));
      }
    });
    return [...given.values()];
  }

  // Each holon as the read holds it, once its stores have answered.
  const held = new Map<string, Kept | null>();

  function holon(id: string): Maybe<Kept | null> {
    if (given.has(id)) return given.get(id)!;
    if (isHandle(id)) throw new Error(`the handle ${id} names no holon the read carries`);
    if (held.has(id)) return held.get(id)!;

    return versionsOf(id).then((found) => {
      if (held.has(id)) return held.get(id)!;

      const first = found.findIndex(Boolean);
      const kept = first < 0 ? null : { holon: found[first]!, store: names[first]! };
      const line = JSON.stringify(found[first]);
      if (kept && found.some((each) => each && JSON.stringify(each) !== line)) diverged.add(id);

      held.set(id, kept);
      return kept;
    });
  }

  async function keepers(id: string) {
    const found = await versionsOf(id);
    return names.filter((_, i) => found[i]);
  }

  async function address(whole: string, name: string) {
    const kept = await holon(whole);
    if (!kept || !stores.has(kept.store)) return null;

    const [found] = (await ask(kept.store, { address: [whole, name] })) as Holon[];
    return found?.id ?? null;
  }

  return {
    stores: names,
    holon,
    keepers,
    facts: (clause) => everywhere({ facts: clause }),
    said: (a, word) => everywhere({ said: { a, word } }),
    address,
    whole,
    log: async (store) => (names.includes(store) ? ((await ask(store, { acts: {} })) as Logged[]) : []),
    asked,
    diverged,
  };
}

// Calls back once the work begun this turn has run as far as it can without waiting.
const nextTurn: (callback: () => void) => void =
  typeof setImmediate === "function"
    ? (callback) => void setImmediate(callback)
    : (callback) => {
        const { port1, port2 } = new MessageChannel();
        port1.onmessage = () => {
          port1.close();
          callback();
        };
        port2.postMessage(null);
      };

function linesOf(bytes: Uint8Array): unknown[] {
  return decoder
    .decode(bytes)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
