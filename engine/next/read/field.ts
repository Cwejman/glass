// The field as one read sees it: every store the worker has mounted, each at the head
// the read began with. It asks the stores what the read needs, when it needs it, and
// keeps each answer for the rest of the read, so nothing is asked twice; and it records
// which stores were asked, which are the heads the answer stood on.
//
// How a bare id finds the store it lies in is not yet designed, so a holon is asked
// first of the store that has kept the most of what this read asked for, since a read
// mostly stays within a store, and of the others only where that one does not keep it.
// A holon kept in two stores is read from the one that answers for it first; where they
// keep it differently the later commit's version is to answer, which is not yet done.

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
  // A whole read into the field at once: the holon and what it holds, down to a depth,
  // not entering holons of the types stop names by id, asked of the store that keeps the
  // holon in one question. What it gives is held for the rest of the read, so reading
  // those holons asks no store again; parts another store keeps are read as any holon is.
  whole(id: string, depth?: number, stop?: string[]): Promise<void>;
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
};

const decoder = new TextDecoder();

export function fieldOf(stores: Stores, heads: Heads): Field {
  const names = [...stores.keys()];
  const asked = new Set<string>();
  const answers = new Map<string, Promise<unknown[]>>();
  const holonsRead = new Map<string, Promise<Kept | null>>();

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

  function holon(id: string) {
    if (!holonsRead.has(id)) holonsRead.set(id, holonIn(id));
    return holonsRead.get(id)!;
  }

  // A holon from the store that has kept the most this read has asked for, else from the
  // first of the others that keeps it.
  const kept = new Map(names.map((name) => [name, 0]));

  async function holonIn(id: string): Promise<Kept | null> {
    const likely = names.reduce((best, name) => (kept.get(name)! > kept.get(best)! ? name : best), names[0]!);
    if (likely === undefined) return null;

    const tried = await ask(likely, { holon: id });
    if (tried.length) return found(likely, tried[0] as Holon);

    const others = names.filter((name) => name !== likely);
    const answers = await Promise.all(others.map((name) => ask(name, { holon: id })));
    const at = answers.findIndex((lines) => lines.length);
    return at < 0 ? null : found(others[at]!, answers[at]![0] as Holon);
  }

  function found(store: string, holon: Holon): Kept {
    kept.set(store, kept.get(store)! + 1);
    return { holon, store };
  }

  // The holons wholes were read from to every depth, entering everything, so a whole
  // within one is not asked for again.
  const entered = new Set<string>();

  async function whole(id: string, depth?: number, stop: string[] = []) {
    if (entered.has(id)) return;
    const root = await holon(id);
    if (!root) return;

    const holons = (await ask(root.store, { whole: { id, depth, stop } })) as Holon[];
    for (const each of holons) {
      if (!holonsRead.has(each.id)) holonsRead.set(each.id, Promise.resolve(found(root.store, each)));
      if (depth === undefined && !stop.length) entered.add(each.id);
    }
  }

  async function keepers(id: string) {
    const answers = await Promise.all(names.map((name) => ask(name, { holon: id })));
    return names.filter((_, i) => answers[i]!.length);
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
    whole,
    facts: (clause) => everywhere({ facts: clause }),
    said: (a, word) => everywhere({ said: { a, word } }),
    address,
    log: async (store) => (names.includes(store) ? ((await ask(store, { acts: {} })) as Logged[]) : []),
    asked,
  };
}

function linesOf(bytes: Uint8Array): unknown[] {
  return decoder
    .decode(bytes)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
