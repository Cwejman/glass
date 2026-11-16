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

import type { Clause, Fact, Head, Holon, Question, Store } from "../../../stores/store.ts";
import type { Heads } from "../engine.ts";

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
  holon(id: string): Promise<Kept | null>;
  // Every store that keeps a holon, in the order they were mounted.
  keepers(id: string): Promise<string[]>;
  // The facts matching a clause, from every store.
  facts(clause: Clause): Promise<Fact[]>;
  // The holons saying a word under a key, as facts, from every store.
  said(a: string, word: string): Promise<Fact[]>;
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

export function fieldOf(stores: Stores, heads: Heads): Field {
  const names = [...stores.keys()];
  const asked = new Set<string>();
  const answers = new Map<string, Promise<unknown[]>>();

  // A store's answer to a question at the read's head, as the values its lines say. A
  // store with no head yet holds nothing.
  function ask(name: string, question: Question): Promise<unknown[]> {
    asked.add(name);
    const head = heads[name] as Head | null | undefined;
    if (!head) return Promise.resolve([]);

    const key = `${name}\u0000${JSON.stringify(question)}`;
    if (!answers.has(key)) answers.set(key, stores.get(name)!.store.read(head, question).then(linesOf));
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

  // Each holon asked for, as every store keeps it, by mount order; asked in batches.
  const versions = new Map<string, Promise<(Holon | undefined)[]>>();
  const diverged = new Set<string>();
  let waiting: { id: string; resolve: (found: (Holon | undefined)[]) => void }[] = [];

  function versionsOf(id: string) {
    if (!versions.has(id)) {
      const { promise, resolve } = Promise.withResolvers<(Holon | undefined)[]>();
      versions.set(id, promise);
      if (!waiting.length) nextTurn(askWaiting);
      waiting.push({ id, resolve });
    }
    return versions.get(id)!;
  }

  // Every holon asked for this turn, asked of every store as one question.
  async function askWaiting() {
    const batch = waiting;
    waiting = [];
    const ids = batch.map(({ id }) => id);
    const answers = await Promise.all(names.map((name) => ask(name, { holons: ids }) as Promise<Holon[]>));
    const byStore = answers.map((holons) => new Map(holons.map((holon) => [holon.id, holon])));

    for (const { id, resolve } of batch) resolve(byStore.map((kept) => kept.get(id)));
  }

  async function holon(id: string): Promise<Kept | null> {
    const found = await versionsOf(id);
    const first = found.findIndex(Boolean);
    if (first < 0) return null;

    const line = JSON.stringify(found[first]);
    if (found.some((each) => each && JSON.stringify(each) !== line)) diverged.add(id);
    return { holon: found[first]!, store: names[first]! };
  }

  async function keepers(id: string) {
    const found = await versionsOf(id);
    return names.filter((_, i) => found[i]);
  }

  async function address(whole: string, name: string) {
    const kept = await holon(whole);
    if (!kept) return null;

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
