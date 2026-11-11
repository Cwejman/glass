// What the interface looks at: a set of holons, gathered by an expression and seen at
// its level, what nothing in it holds, or Flat, all of it, or in collections along an
// axis, each itself an expression, so it opens as a place of its own. The kernel works
// every expression out; here it is asked only for the holons it gathers, and what the
// functions that gather say they take is held to before it is.
//
//   { "$ref": H }                the holon H, as a set of one
//   { "call": F, "with": [ … ] } the function F, given its arguments
//   { "arg": i }                 within a function of one's own, what it was given
import { notASet } from "./reads.ts";

import { isId, type Holon } from "../integrations/glass/store.ts";
import type { LogEntry } from "../integrations/glass/store.ts";
import { kernelOf, type Shelf } from "./kernel.ts";
import { mouldOf, type Mould } from "./moulds.ts";
import { isRef, references } from "./references.ts";

export type Expression = { $ref: string } | { call: { $ref: string }; with?: Argument[] } | { arg: number };
export type Argument = Expression | string;

export const axes = ["type", "parent", "store"] as const;
export type Axis = (typeof axes)[number];

export type Takes = "set" | "sets" | "words" | "store" | "axis";

// A holon as the field knows it: the store it is read from, and the block its version
// was read from, where the store says, so a version is known again without reading it.
export type Known = { store: string; holon: Holon; block?: string };

// Everything the field holds, as a value to ask.
export type Everything = {
  known: ReadonlyMap<string, Known>;
  holders: ReadonlyMap<string, readonly Holder[]>;
  // Each store's log, where an expression asks of history.
  logs?: ReadonlyMap<string, LogEntry[]>;
  // Each store's holons as the field carries them, the same list while the store is
  // unchanged, so what is worked out of a store can be kept beside it.
  held: ReadonlyMap<string, readonly Known[]>;
  // Each store's index as last made, handed from field to field.
  shelf: Shelf;
  // Every store a holon is kept in, where it is kept in more than one, in the order they
  // are attached; there is nothing first about it.
  residences: ReadonlyMap<string, readonly string[]>;
};

// Every store a holon resides in.
export const storesOf = (all: Everything, id: string): readonly string[] =>
  all.residences.get(id) ?? [all.known.get(id)!.store];

export type Holder = { from: string; key: string; holds: boolean };

const mouldIn = (known: Everything["known"], holon: Holon) =>
  mouldOf(holon.instance.map((type) => known.get(type)?.holon.mould as Mould | undefined));

export function everythingOf(
  known: Everything["known"],
  held: Everything["held"],
  shelf: Shelf = new Map(),
): Everything {
  const holders = new Map<string, Holder[]>();

  for (const { holon } of known.values()) {
    for (const { id, key, holds } of references(holon.body, mouldIn(known, holon))) {
      let list = holders.get(id);

      if (!list) {
        list = [];
        holders.set(id, list);
      }

      list.push({ from: holon.id, key, holds });
    }
  }

  const residences = new Map<string, string[]>();
  for (const [key, list] of held)
    for (const each of list) {
      const read = known.get(each.holon.id);
      if (read === each) continue;
      const stores = residences.get(each.holon.id) ?? [read!.store];
      if (!stores.includes(key)) stores.push(key);
      residences.set(each.holon.id, stores);
    }

  return { known, holders, held, shelf, residences };
}

const nesting = 32;

// ---- Gathering

// A set is worked out by the kernel, like any value; here it is only asked to be a set.
// The functions that gather say what they take, so what they are given is judged first.

type Definition = { takes?: Takes[]; native?: string; gives?: Expression };

const setKinds = new Set<string>(["set", "sets", "words", "store", "axis"]);

function called(all: Everything, expression: { call: { $ref: string }; with?: Argument[] }) {
  const holon = all.known.get(expression.call.$ref)?.holon;
  if (!holon) throw new Error(`${expression.call.$ref} is not in the field`);

  const fn = holon.body as Definition;
  const title = holon.name ?? holon.id;

  if (!fn.native && !fn.gives) throw new Error(`${title} is not a function the engine can run`);

  const given = expression.with ?? [];
  const takes = fn.takes ?? [];

  if (takes.every((kind) => setKinds.has(kind))) {
    const wrong = argumentsProblem(takes, given);
    if (wrong) throw new Error(`${title} ${wrong}`);
  }

  return { fn, given };
}

function argumentsProblem(takes: Takes[], given: Argument[]) {
  const variadic = takes.at(-1) === "sets";

  if (variadic ? given.length < takes.length : given.length !== takes.length) {
    return `takes ${takes.length === 0 ? "nothing" : takes.join(", ")}, and was given ${given.length}`;
  }

  for (const [i, argument] of given.entries()) {
    const kind = takes[Math.min(i, takes.length - 1)]!;
    const takesSet = kind === "set" || kind === "sets";

    if (takesSet === (typeof argument === "string"))
      return `takes ${takesSet ? "a set" : `a ${kind}`} as its argument ${i + 1}`;
    if (kind === "axis" && !axes.includes(argument as Axis)) return `groups by ${axes.join(", ")}`;
  }

  return undefined;
}

// A function of one's own that gives an expression by its arguments' places, which a
// way of looking can be seen through; one that gives a lambda is worked out whole.
const byPlace = (fn: Definition) =>
  fn.gives !== undefined && !(typeof fn.gives === "object" && fn.gives !== null && "fn" in fn.gives);

// A function of one's own's expression, each argument it names given in.
function substituted(expression: Expression, given: Argument[]): Expression {
  // Only a call and an argument are worked into; a list is gone through, and anything
  // else, a pattern's variable, a record or a value, stands as it is.
  const inner = (value: Argument): Argument => {
    if (Array.isArray(value)) return value.map(inner) as unknown as Argument;
    if (typeof value !== "object" || value === null || "$ref" in value) return value;

    if ("arg" in value) {
      const argument = given[value.arg];
      if (argument === undefined) throw new Error(`there is no argument ${value.arg + 1}`);
      return argument;
    }

    if (!("call" in value)) return value;

    return { call: value.call, ...(value.with ? { with: value.with.map(inner) } : {}) };
  };

  const done = inner(expression);
  if (typeof done === "string") throw new Error("a function gives a set, not words");

  return done;
}

// Where each holon stands in the field, so a set comes back in the field's order.
const places = new WeakMap<Everything["known"], Map<string, number>>();
const placeOf = (all: Everything) => {
  let made = places.get(all.known);
  if (!made) places.set(all.known, (made = new Map([...all.known.keys()].map((id, i) => [id, i]))));

  return made;
};

// Everything never changes, and neither does what an expression gathers from it, so
// a set is worked out once. A place of many collections shares most of its sets.
const gathered = new WeakMap<Everything, Map<string, string[]>>();

export function gather(all: Everything, expression: Expression, nested = 0): string[] {
  if (nested >= nesting) throw new Error(`an expression nests at most ${nesting} deep`);
  if ("$ref" in expression) return all.known.has(expression.$ref) ? [expression.$ref] : [];
  if ("arg" in expression) throw new Error("an argument is given only within a function of one's own");

  const key = JSON.stringify(expression);
  const sets = gathered.get(all) ?? new Map<string, string[]>();
  gathered.set(all, sets);

  const known = sets.get(key);
  if (known) return known;

  called(all, expression);

  const value = kernelOf(all).evaluate(expression);
  if (!Array.isArray(value) || !value.every(isRef)) throw new Error(notASet);

  const place = placeOf(all);
  const set = [...new Set(value.map(({ $ref }) => $ref))]
    .filter((id) => place.has(id))
    .sort((a, b) => place.get(a)! - place.get(b)!);

  sets.set(key, set);

  return set;
}

// ---- Grouping

export type Grouped = {
  by: Axis;
  groups: { value: string; count: number; gathers: Expression }[];
  rest: string[];
};

const nativesHeld = new WeakMap<Everything["known"], Map<string, string>>();

function nativeIds(all: Everything) {
  let found = nativesHeld.get(all.known);

  if (!found) {
    found = new Map();
    nativesHeld.set(all.known, found);

    for (const { holon } of all.known.values()) {
      const native = (holon.body as Definition).native;
      if (typeof native === "string" && !found.has(native)) found.set(native, holon.id);
    }
  }

  return found;
}

function valuesAlong(all: Everything, id: string, axis: Axis) {
  const known = all.known.get(id)!;

  if (axis === "type") return known.holon.instance;
  if (axis === "store") return storesOf(all, id);

  return [...new Set((all.holders.get(id) ?? []).filter(({ holds }) => holds).map(({ from }) => from))];
}

// The values a set has along an axis, in the order they appear. A value every
// holon here shares says nothing here, so it is not a value.
function splitBy(all: Everything, gathered: string[], axis: Axis) {
  const values = new Map<string, string[]>();

  for (const id of gathered) {
    for (const value of valuesAlong(all, id, axis)) {
      const list = values.get(value);

      if (list) list.push(id);
      else values.set(value, [id]);
    }
  }

  for (const [value, members] of values) {
    if (members.length === gathered.length) values.delete(value);
  }

  const valued = new Set([...values.values()].flat());

  return { values, rest: gathered.filter((id) => !valued.has(id)) };
}

const nativeCall = (all: Everything, name: string, ...given: Argument[]): Expression => ({
  call: { $ref: nativeIds(all).get(name)! },
  with: given,
});

// A collection: what the grouping gathers narrowed to one value.
function narrowed(all: Everything, inner: Expression, by: Axis, value: string): Expression {
  const calls = (expression: Expression, name: string) =>
    "call" in expression && expression.call.$ref === nativeIds(all).get(name);

  const narrow =
    by === "type"
      ? nativeCall(all, "type", { $ref: value })
      : by === "parent"
        ? nativeCall(all, "children", { $ref: value })
        : nativeCall(all, "store", value);

  if (calls(inner, "everything")) return narrow;

  return nativeCall(
    all,
    "and",
    ...(calls(inner, "and") ? (inner as { with: Argument[] }).with : [inner]),
    narrow,
  );
}

function collected(all: Everything, inner: Expression, by: Axis): Grouped {
  const { values, rest } = splitBy(all, gather(all, inner), by);

  return {
    by,
    groups: [...values]
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([value, members]) => ({
        value,
        count: members.length,
        gathers: narrowed(all, inner, by, value),
      })),
    rest,
  };
}

// A set's collections, the larger first, and what has no value on its axis. What is
// not a grouping has none, and a function of one's own is looked through.
export function groups(all: Everything, expression: Expression, nested = 0): Grouped | null {
  if (!("call" in expression) || nested >= nesting) return null;

  const { fn, given } = called(all, expression);

  if (fn.gives) return byPlace(fn) ? groups(all, substituted(fn.gives, given), nested + 1) : null;

  if (fn.native !== "group") return null;

  const [inner, by] = given as [Expression, Axis];

  return collected(all, inner, by);
}

// ---- Levels

// What nothing in the set holds. A set that holds itself round has no top, and is
// given as it is.
function topOf(all: Everything, gathered: string[]): string[] {
  const members = new Set(gathered);
  const tops = gathered.filter(
    (id) => !(all.holders.get(id) ?? []).some(({ from, holds }) => holds && members.has(from)),
  );

  return tops.length ? tops : gathered;
}

// What an expression shows when looked at: its top, or, where it says Flat, all of it.
export function level(all: Everything, expression: Expression, nested = 0): string[] {
  if ("call" in expression && nested < nesting) {
    const { fn, given } = called(all, expression);

    if (byPlace(fn)) return level(all, substituted(fn.gives!, given), nested + 1);
    if (fn.native === "flat") return gather(all, expression);
  }

  return topOf(all, gather(all, expression));
}

// ---- Shape

// What is wrong with a value meant as an expression, in its shape, if anything: a value
// standing for itself, a holon, a call, a lambda and its words, a place given, a pattern's
// variable, or a list or record of expressions. What each function takes is judged as it is called.
export function expressionProblem(value: unknown, nested = 0): string | undefined {
  if (nested >= nesting) return `an expression nests at most ${nesting} deep`;
  if (value === null || typeof value !== "object") return undefined;
  if (Array.isArray(value)) return "a list in an expression is written { list: [ … ] }";

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const only = (...allowed: string[]) => keys.every((key) => allowed.includes(key));
  const inner = (each: unknown) => expressionProblem(each, nested + 1);

  if ("$ref" in record)
    return only("$ref") && isId(record.$ref) ? undefined : "a holon is given as { $ref: id }";

  if ("arg" in record)
    return only("arg") && Number.isInteger(record.arg) && (record.arg as number) >= 0
      ? undefined
      : "an argument is given as { arg: i }, counted from 0";

  if ("?" in record)
    return only("?") && typeof record["?"] === "string"
      ? undefined
      : "a pattern's variable is given as { ?: word }";

  if ("var" in record)
    return only("var") && typeof record.var === "string"
      ? undefined
      : "a lambda's word is given as { var: word }";

  if ("fn" in record) {
    const words = record.fn;
    if (!only("fn", "gives") || !Array.isArray(words) || !words.every((word) => typeof word === "string"))
      return "a lambda is { fn: [words], gives: expression }";

    return inner(record.gives);
  }

  if ("list" in record) {
    if (!only("list") || !Array.isArray(record.list)) return "a list is { list: [ … ] }";
    return record.list.map(inner).find(Boolean);
  }

  if ("record" in record) {
    const fields = record.record;
    if (!only("record") || typeof fields !== "object" || fields === null || Array.isArray(fields))
      return "a record is { record: { … } }";

    return Object.values(fields).map(inner).find(Boolean);
  }

  if (!("call" in record) || !only("call", "with"))
    return "an expression is a value, a holon, a call, a lambda, a list or a record";

  const call = record.call as { $ref?: unknown } | null;
  if (typeof call !== "object" || call === null || Object.keys(call).length !== 1 || !isId(call.$ref))
    return "a call names its function as { $ref: id }";

  if (record.with === undefined) return undefined;
  if (!Array.isArray(record.with)) return "what a call gives is a list";

  return record.with.map(inner).find(Boolean);
}
