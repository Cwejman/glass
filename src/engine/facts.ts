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
// value refers to. It is a pure function of the store's holons at a commit and of the
// types they are read through, which may stand in another store, and of the key the
// store is attached by; so it is built wherever it runs, and shipping it beside the
// blocks asks first that holding be read from $holds alone. Another kind of store
// answers the same clauses its own way.

import type { Holon } from "../store/store.ts";
import type { Known } from "./expression.ts";
import { mouldOf, type Mould } from "./moulds.ts";
import { isRef, references } from "./references.ts";

export type Scalar = string | number | boolean;
export type FactValue = Scalar | { $ref: string };
export type Fact = { e: string; a: string; v: FactValue };

// What a clause knows before it is answered: a holon, a key, a value, any or none; or
// that it can match nothing, as when what stands for a holon is not one.
export type Asked = { e?: string; a?: string; v?: FactValue; nothing?: true };

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

// The facts one holon says, given the moulds of what it is.
export function factsOf(holon: Holon, store: string, mould: Mould): Fact[] {
  const e = holon.id;
  const facts: Fact[] = [
    ...holon.instance.map((type) => ({ e, a: "instance", v: { $ref: type } })),
    ...(holon.name !== undefined ? [{ e, a: "name", v: holon.name }] : []),
    { e, a: "store", v: store },
  ];

  for (const { id, key, holds } of references(holon.body, mould)) {
    facts.push({ e, a: key, v: { $ref: id } });
    if (holds) facts.push({ e, a: "$holds", v: { $ref: id } });
  }

  for (const [key, value] of Object.entries(holon.body)) {
    if (key.startsWith("$")) continue;

    for (const item of Array.isArray(value) ? value : [value]) {
      if (isScalar(item)) facts.push({ e, a: key, v: item });
    }
  }

  return facts;
}

const pushed = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

// A store's index of its facts, in four orders.
export function indexOf(held: readonly Known[], mouldFor: (holon: Holon) => Mould): Answering {
  const all: Fact[] = [];
  const byHolon = new Map<string, Fact[]>();
  const byKey = new Map<string, Fact[]>();
  const byKeyValue = new Map<string, Fact[]>();
  const byRef = new Map<string, Fact[]>();

  for (const { holon, store } of held) {
    for (const fact of factsOf(holon, store, mouldFor(holon))) {
      all.push(fact);
      pushed(byHolon, fact.e, fact);
      pushed(byKey, fact.a, fact);
      pushed(byKeyValue, `${fact.a}\u0000${valueKey(fact.v)}`, fact);
      if (isRef(fact.v)) pushed(byRef, fact.v.$ref, fact);
    }
  }

  const matches =
    ({ e, a, v }: Asked) =>
    (fact: Fact) =>
      (e === undefined || fact.e === e) &&
      (a === undefined || fact.a === a) &&
      (v === undefined || valueKey(fact.v) === valueKey(v));

  // The order that answers a clause most narrowly, and what it finds before the rest is held to.
  function order({ e, a, v, nothing }: Asked): [string, Fact[]] {
    if (nothing) return ["nothing, as it can match none", []];
    if (e !== undefined) return ["by holon", byHolon.get(e) ?? []];
    if (a !== undefined && v !== undefined)
      return ["by key and value", byKeyValue.get(`${a}\u0000${valueKey(v)}`) ?? []];
    if (v !== undefined && isRef(v)) return ["by what it refers to", byRef.get(v.$ref) ?? []];
    if (a !== undefined) return ["by key", byKey.get(a) ?? []];

    return ["every fact", all];
  }

  return {
    answer: (asked) => order(asked)[1].filter(matches(asked)),
    count: (asked) => order(asked)[1].length,
    served: (asked) => order(asked)[0],
  };
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
  mouldOf(holon.instance.map((type) => known.get(type)?.holon.mould as Mould | undefined));
