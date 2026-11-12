// A store read as facts, and the store's own index of them. A fact is one thing a holon
// says, [holon, key, value]: what it is an instance of, its name, the store it stands in,
// and each value its body holds under a key: a reference under that key at any depth,
// and a string, number or truth at the top or as an item of a list. What it holds as a
// part is said once more under glass's own mark, [whole, "$holds", part], so holding is
// joined like anything else. A list gives a fact for each item, so a fact says what is
// held, not in what order; order lives in the body, read by get.
//
// A store answers a clause, [e, a, v] with any of them known, from its index: the same
// facts kept in four orders, by holon, by key, by key and value, and by the holon a
// value refers to. A fifth is kept for words: each string under a key cut into the words
// it says, as full text search keeps them, so a word said is a fact like any other; it
// is made for a key the first time a word is asked of it, and kept. A store a commit
// changed has its index patched from the one before by the holons that changed, and it
// answers as one made fresh. It is a pure function of the store's holons at a commit and of the
// types they are read through, which may stand in another store, and of the key the
// store is attached by; so it is built wherever it runs, and shipping it beside the
// blocks asks first that holding be read from $holds alone. Another kind of store
// answers the same clauses its own way.

import type { Holon } from "../../../integrations/glass/store.ts";
import type { Found as Known } from "../world.ts";
import { isRef, mouldOf, references, type Mould } from "../moulds.ts";
import { wordsOf } from "./words.ts";

export type Scalar = string | number | boolean;
export type FactValue = Scalar | { $ref: string };
// A fact may carry its value's key, k, where the store keeps it, so the engine need not
// say it again for every join; where it does not, the engine says it.
export type Fact = { e: string; a: string; v: FactValue; k?: string };

// What a clause knows before it is answered: a holon, a key, a value, any or none; or
// that it can match nothing, as when what stands for a holon is not one.
// Asked of the words a string says, the value is one word, and the key must be known.
export type Asked = { e?: string; a?: string; v?: FactValue; words?: true; nothing?: true };

// What a store's integration gives the engine: answers to a clause, and how many there
// would be, so the cheapest clause is answered first.
export type Answering = {
  answer(asked: Asked): Fact[];
  count(asked: Asked): number;
  // Which of its orders served a clause, so a plan can be said.
  served(asked: Asked): string;
};

const isScalar = (value: unknown): value is Scalar =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

// A value's key in an index: a holon by its id, anything else by its kind and text.
export const valueKey = (value: FactValue) => (isRef(value) ? value.$ref : `${typeof value}:${value}`);

// A fact's value's key, kept or said.
export const keyOfFact = (fact: Fact) => fact.k ?? valueKey(fact.v);

// That a holon is kept in a store.
const storeFact = (e: string, store: string): Fact => ({ e, a: "store", v: store, k: valueKey(store) });

// The facts one holon says, given the moulds of what it is.
export function factsOf(holon: Holon, store: string, mould: Mould): Fact[] {
  const e = holon.id;
  const facts: Fact[] = [
    ...holon.instance.map((type) => ({ e, a: "instance", v: { $ref: type }, k: type })),
    ...(holon.name !== undefined ? [{ e, a: "name", v: holon.name, k: valueKey(holon.name) }] : []),
    storeFact(e, store),
  ];

  for (const { id, key, holds } of references(holon.body, mould)) {
    facts.push({ e, a: key, v: { $ref: id }, k: id });
    if (holds) facts.push({ e, a: "$holds", v: { $ref: id }, k: id });
  }

  for (const [key, value] of Object.entries(holon.body)) {
    if (key.startsWith("$")) continue;

    for (const item of Array.isArray(value) ? value : [value]) {
      if (isScalar(item)) facts.push({ e, a: key, v: item, k: valueKey(item) });
    }
  }

  return facts;
}

const pushed = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

// The words said under one key, as facts of their own, by holon and by word, and the
// holons that say any, in the store's order.
type Words = {
  ids: readonly string[];
  byHolon: ReadonlyMap<string, readonly Fact[]>;
  byWord: ReadonlyMap<string, readonly Fact[]>;
};

// A store's facts in their orders: by holon, both as the holon says them and each key
// apart, so what a holon says under one key is counted as it is; by key; by key and
// value; by what a value refers to. The holons in the store's order, and whether that
// order is by id, which a patch asks. Every list is made once and never changed after,
// so an index patched from this one may share any list it did not touch; only the words
// are filled in later, a key at a time, each in its index's own map.
type Orders = {
  ids: readonly string[];
  byId: boolean;
  count: number;
  byHolon: ReadonlyMap<string, readonly Fact[]>;
  byHolonKey: ReadonlyMap<string, ReadonlyMap<string, readonly Fact[]>>;
  byKey: ReadonlyMap<string, readonly Fact[]>;
  byKeyValue: ReadonlyMap<string, readonly Fact[]>;
  byRef: ReadonlyMap<string, readonly Fact[]>;
  // The words, made for a key the first time a word is asked of it, and kept.
  spoken: Map<string, Words>;
};

// An index, with the orders it answers from, so the next can be patched from it.
export type Index = Answering & { orders: Orders };

const keyValue = (fact: Fact) => `${fact.a}\u0000${keyOfFact(fact)}`;

const inIdOrder = (ids: readonly string[]) => ids.every((id, i) => i === 0 || ids[i - 1]! < id);

// The facts a set of holons says, each holon's together in order, put in their orders.
function ordered(facts: readonly Fact[]) {
  const byHolon = new Map<string, Fact[]>();
  const byHolonKey = new Map<string, Map<string, Fact[]>>();
  const byKey = new Map<string, Fact[]>();
  const byKeyValue = new Map<string, Fact[]>();
  const byRef = new Map<string, Fact[]>();

  for (const fact of facts) {
    pushed(byHolon, fact.e, fact);
    let said = byHolonKey.get(fact.e);
    if (!said) byHolonKey.set(fact.e, (said = new Map()));
    pushed(said, fact.a, fact);
    pushed(byKey, fact.a, fact);
    pushed(byKeyValue, keyValue(fact), fact);
    if (isRef(fact.v)) pushed(byRef, fact.v.$ref, fact);
  }

  return { byHolon, byHolonKey, byKey, byKeyValue, byRef };
}

// What one holon a store keeps says there: all it says, or, where another store's copy
// of it is the one the field reads, only that it is kept here too, so it is said once.
const saidHere = (each: Known, mouldFor: (holon: Holon) => Mould, also: ReadonlySet<Known>) =>
  also.has(each)
    ? [storeFact(each.holon.id, each.store)]
    : factsOf(each.holon, each.store, mouldFor(each.holon));

// A store's index of its facts.
export function indexOf(
  held: readonly Known[],
  mouldFor: (holon: Holon) => Mould,
  also: ReadonlySet<Known> = new Set(),
): Index {
  const facts = held.flatMap((each) => saidHere(each, mouldFor, also));
  const ids = held.map(({ holon }) => holon.id);

  return answering({ ids, byId: inIdOrder(ids), count: facts.length, ...ordered(facts), spoken: new Map() });
}

// Each word once for each holon, however many of its strings under the key say it.
function wordFacts(a: string, e: string, said: readonly Fact[]): Fact[] {
  const words = new Set<string>();
  for (const { v } of said) wordsOf(v).forEach((word) => words.add(word));

  return [...words].map((word) => ({ e, a, v: word, k: valueKey(word) }));
}

function wordsUnder(orders: Orders, a: string): Words {
  const kept = orders.spoken.get(a);
  if (kept) return kept;

  const ids: string[] = [];
  const byHolon = new Map<string, Fact[]>();
  const byWord = new Map<string, Fact[]>();
  for (const e of orders.ids) {
    const said = orders.byHolonKey.get(e)?.get(a);
    if (!said) continue;

    const facts = wordFacts(a, e, said);
    if (!facts.length) continue;

    ids.push(e);
    byHolon.set(e, facts);
    for (const fact of facts) pushed(byWord, fact.v as string, fact);
  }

  const made = { ids, byHolon, byWord };
  orders.spoken.set(a, made);
  return made;
}

// Every fact, in the store's order, made only when asked.
const everyFact = (ids: readonly string[], byHolon: ReadonlyMap<string, readonly Fact[]>) =>
  ids.flatMap((e) => byHolon.get(e) ?? []);

function answering(orders: Orders): Index {
  let all: readonly Fact[] | undefined;
  const allWords = new Map<string, readonly Fact[]>();

  // The words a key's strings say, ordered as narrowly as what is asked allows.
  function wordOrder({ e, a, v }: Asked): [string, readonly Fact[]] {
    if (a === undefined) throw new Error("a word said names the key whose strings say it");

    const under = wordsUnder(orders, a);
    if (e !== undefined) return ["by holon, key and word", under.byHolon.get(e) ?? []];
    if (typeof v === "string") return ["by key and word", under.byWord.get(v) ?? []];

    let every = allWords.get(a);
    if (!every) allWords.set(a, (every = everyFact(under.ids, under.byHolon)));
    return ["by key, as words", every];
  }

  // What is asked is said once, and each fact held to it.
  const matches = ({ e, a, v }: Asked) => {
    const k = v === undefined ? undefined : valueKey(v);

    return (fact: Fact) =>
      (e === undefined || fact.e === e) &&
      (a === undefined || fact.a === a) &&
      (k === undefined || keyOfFact(fact) === k);
  };

  // The order that answers a clause most narrowly, and what it finds before the rest is held to.
  function order(asked: Asked): [string, readonly Fact[]] {
    const { e, a, v, nothing } = asked;
    const { byHolon, byHolonKey, byKey, byKeyValue, byRef } = orders;
    if (nothing) return ["nothing, as it can match none", []];
    if (asked.words) return wordOrder(asked);
    if (e !== undefined && a !== undefined) return ["by holon and key", byHolonKey.get(e)?.get(a) ?? []];
    if (e !== undefined) return ["by holon", byHolon.get(e) ?? []];
    if (a !== undefined && v !== undefined)
      return ["by key and value", byKeyValue.get(`${a}\u0000${valueKey(v)}`) ?? []];
    if (v !== undefined && isRef(v)) return ["by what it refers to", byRef.get(v.$ref) ?? []];
    if (a !== undefined) return ["by key", byKey.get(a) ?? []];

    return ["every fact", (all ??= everyFact(orders.ids, byHolon))];
  }

  // Asked nothing at all: every fact, counted without being gathered.
  const unasked = (asked: Asked) =>
    !asked.nothing && !asked.words && Object.values(asked).every((given) => given === undefined);

  return {
    orders,
    answer: (asked) => order(asked)[1].filter(matches(asked)),
    count: (asked) => (unasked(asked) ? orders.count : order(asked)[1].length),
    served: (asked) => order(asked)[0],
  };
}

// ---- Patching

// Where a holon's facts begin in a list in order by id, or where they would.
function firstOf(list: readonly Fact[], e: string) {
  let lo = 0;
  let hi = list.length;

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid]!.e < e) lo = mid + 1;
    else hi = mid;
  }

  return lo;
}

// A list in order by id, each holon named taken out and what it says now put in its
// place: the rest copied a stretch at a time, not a fact at a time.
function patchedList(list: readonly Fact[], holons: readonly string[], now: ReadonlyMap<string, Fact[]>) {
  const pieces: (readonly Fact[])[] = [];
  let at = 0;

  for (const e of holons) {
    const from = firstOf(list, e);
    let to = from;
    while (to < list.length && list[to]!.e === e) to++;

    pieces.push(list.slice(at, from), now.get(e) ?? []);
    at = to;
  }

  pieces.push(list.slice(at));
  return pieces.flat();
}

// An order with what the dirty holons said taken out of each list it is under, and what
// they say now put in, by id; every other list is the same as before.
function patchedOrder<K>(
  order: ReadonlyMap<K, readonly Fact[]>,
  removed: readonly Fact[],
  added: readonly Fact[],
  keyOf: (fact: Fact) => K | undefined,
): Map<K, readonly Fact[]> {
  // Under each key touched, the holons touched, and what each says now.
  const touched = new Map<K, { holons: Set<string>; now: Map<string, Fact[]> }>();
  const under = (key: K) => {
    let entry = touched.get(key);
    if (!entry) touched.set(key, (entry = { holons: new Set(), now: new Map() }));
    return entry;
  };

  for (const fact of removed) {
    const key = keyOf(fact);
    if (key !== undefined) under(key).holons.add(fact.e);
  }

  for (const fact of added) {
    const key = keyOf(fact);
    if (key === undefined) continue;

    const entry = under(key);
    entry.holons.add(fact.e);
    pushed(entry.now, fact.e, fact);
  }

  const next = new Map(order);

  for (const [key, { holons, now }] of touched) {
    const list = patchedList(order.get(key) ?? [], [...holons].sort(), now);

    if (list.length) next.set(key, list);
    else next.delete(key);
  }

  return next;
}

// Ids in the store's order, the dirty taken out and those still held put in.
function patchedIds(ids: readonly string[], dirty: ReadonlySet<string>, now: readonly string[]) {
  const kept = ids.filter((id) => !dirty.has(id));
  const out: string[] = [];
  let i = 0;
  let j = 0;

  while (i < kept.length && j < now.length) out.push(kept[i]! < now[j]! ? kept[i++]! : now[j++]!);
  return [...out, ...kept.slice(i), ...now.slice(j)];
}

// The words under a key the dirty holons touched, patched as the facts are.
function patchedWords(
  words: Words,
  a: string,
  dirty: ReadonlySet<string>,
  orders: Orders,
  now: string[],
): Words {
  const byHolon = new Map(words.byHolon);
  const removed = [...dirty].flatMap((e) => words.byHolon.get(e) ?? []);
  const added: Fact[] = [];
  const saying: string[] = [];

  for (const e of dirty) byHolon.delete(e);
  for (const e of now) {
    const facts = wordFacts(a, e, orders.byHolonKey.get(e)?.get(a) ?? []);
    if (!facts.length) continue;

    byHolon.set(e, facts);
    added.push(...facts);
    saying.push(e);
  }

  return {
    ids: patchedIds(words.ids, dirty, saying),
    byHolon,
    byWord: patchedOrder(words.byWord, removed, added, (fact) => fact.v as string),
  };
}

// The index of a store some of whose holons changed, patched from the one before: the
// dirty, those whose version, types or claim changed, said again, and nothing else. It
// answers as an index made fresh of the same holons, in the same order, which asks that
// the store give its holons in order by id, before as now; where it does not, there is
// no patch, and the index is made fresh.
export function patchedIndex(
  before: Index,
  held: readonly Known[],
  also: ReadonlySet<Known>,
  dirty: ReadonlySet<string>,
  mouldFor: (holon: Holon) => Mould,
): Index | undefined {
  const old = before.orders;
  const ids = held.map(({ holon }) => holon.id);
  if (!old.byId || !inIdOrder(ids)) return undefined;

  const now = held.filter(({ holon }) => dirty.has(holon.id));
  const added = now.flatMap((each) => saidHere(each, mouldFor, also));
  const removed = [...dirty].flatMap((e) => old.byHolon.get(e) ?? []);

  const byHolon = new Map(old.byHolon);
  const byHolonKey = new Map(old.byHolonKey);
  for (const e of dirty) {
    byHolon.delete(e);
    byHolonKey.delete(e);
  }

  const fresh = ordered(added);
  for (const [e, facts] of fresh.byHolon) byHolon.set(e, facts);
  for (const [e, said] of fresh.byHolonKey) byHolonKey.set(e, said);

  const orders: Orders = {
    ids,
    byId: true,
    count: old.count - removed.length + added.length,
    byHolon,
    byHolonKey,
    byKey: patchedOrder(old.byKey, removed, added, (fact) => fact.a),
    byKeyValue: patchedOrder(old.byKeyValue, removed, added, keyValue),
    byRef: patchedOrder(old.byRef, removed, added, (fact) => (isRef(fact.v) ? fact.v.$ref : undefined)),
    spoken: new Map(),
  };

  // The words made before are carried where the key's strings are as they were, and
  // patched where they are not; the map they stand in is this index's own.
  const touchedKeys = new Set([...removed, ...added].map(({ a }) => a));
  const nowIds = now.map(({ holon }) => holon.id);
  for (const [a, words] of old.spoken)
    orders.spoken.set(a, touchedKeys.has(a) ? patchedWords(words, a, dirty, orders, nowIds) : words);

  return answering(orders);
}

// The field's stores answering as one: each asked, their answers put together.
export function answeringAll(stores: readonly Answering[]): Answering {
  return {
    answer: (asked) => stores.flatMap((store) => store.answer(asked)),
    count: (asked) => stores.reduce((n, store) => n + store.count(asked), 0),
    served: (asked) =>
      [...new Set(stores.filter((store) => store.count(asked)).map((store) => store.served(asked)))].join(
        ", ",
      ) || "nothing",
  };
}

// The moulds a holon's types give, read from what the field knows.
export const mouldIn = (known: ReadonlyMap<string, Known>) => (holon: Holon) =>
  mouldOf(holon.instance.map((type) => known.get(type)?.holon));
