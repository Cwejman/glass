// An expression is a function given what it takes: data, held in a body like any
// other value, so a holon can gather as easily as it can point. Evaluated against
// everything the field holds, it gives the holons it gathers, in the field's order.
//
//   { "$ref": H }                the holon H, as a set of one
//   { "call": F, "with": [ … ] } the function F, given its arguments
//   { "arg": i }                 within a function of one's own, what it was given
//
// A function is a holon. A few are native, the table below. Any other gives an
// expression over what it takes, so it stands beside them and reads as they do.
//
// Worked out, a set is flat, so that sets compose. Looked at, it is seen at its level:
// what nothing in it holds, each opened to go down. Flat is the deliberate way to see
// all of it. A grouping gives it in collections instead, one for each value along an
// axis chosen, each itself an expression, so it opens as a place of its own.

import { isId, type Holon } from "../store/store.ts";
import { mouldOf, type Mould } from "./moulds.ts";
import { references } from "./references.ts";

export type Expression = { $ref: string } | { call: { $ref: string }; with?: Argument[] } | { arg: number };
export type Argument = Expression | string;

export const axes = ["type", "parent", "store"] as const;
export type Axis = (typeof axes)[number];

export type Takes = "set" | "sets" | "words" | "store" | "axis";

export type Known = { store: string; holon: Holon };

// Everything the field holds, as a value to ask.
export type Everything = {
  known: ReadonlyMap<string, Known>;
  holders: ReadonlyMap<string, readonly Holder[]>;
};

export type Holder = { from: string; key: string; holds: boolean };

const mouldIn = (known: Everything["known"], holon: Holon) =>
  mouldOf(holon.instance.map((type) => known.get(type)?.holon.mould as Mould | undefined));

export function everythingOf(known: Everything["known"]): Everything {
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

  return { known, holders };
}

const nesting = 32;

// ---- The natives

type Native = (all: Everything, given: Argument[], set: (argument: Argument) => string[]) => string[];

const ids = ({ known }: Everything) => [...known.keys()];

const keep = (all: Everything, test: (id: string) => boolean) => ids(all).filter(test);

const asWords = (text: string) => text.toLocaleLowerCase().split(/\s+/).filter(Boolean);

// What may be said of a holon as text: its name, its own strings, and the words it
// holds. Never what is code, nor the references it points by.
function saying(all: Everything, holon: Holon) {
  const mould = mouldIn(all.known, holon);
  const said: string[] = holon.name ? [holon.name] : [];

  const walk = (value: unknown, key?: string): void => {
    if (key === "$ref") return;

    if (typeof value === "string") said.push(value);
    else if (Array.isArray(value)) value.forEach((item) => walk(item));
    else if (typeof value === "object" && value !== null) {
      for (const [inner, held] of Object.entries(value)) walk(held, inner);
    }
  };

  for (const [key, value] of Object.entries(holon.body)) {
    if (mould[key]?.shape !== "code") walk(value);
  }

  for (const { id, holds } of references(holon.body, mould)) {
    const part = holds ? all.known.get(id)?.holon.body : undefined;
    if (part?.lexeme) said.push(part.text);
  }

  return said.join(" ").toLocaleLowerCase();
}

// A word or a lexeme is said by what holds it, so a search lands on a sentence.
const isWordLike = (all: Everything, holon: Holon) =>
  holon.instance.some((type) => ["word", "lexeme"].includes(all.known.get(type)?.holon.name ?? ""));

// The holons a set connects to, down what they refer to or up what refers to them,
// by holding or by pointing.
const along =
  (direction: "down" | "up", holding: boolean): Native =>
  (all, [given], set) => {
    const across = (id: string) => {
      if (direction === "up")
        return (all.holders.get(id) ?? []).filter(({ holds }) => holds === holding).map(({ from }) => from);

      const { holon } = all.known.get(id)!;
      return references(holon.body, mouldIn(all.known, holon))
        .filter(({ holds }) => holds === holding)
        .map(({ id }) => id);
    };

    const reached = new Set(set(given!).flatMap(across));

    return keep(all, (id) => reached.has(id));
  };

const natives: Record<string, Native> = {
  everything: (all) => ids(all),

  type: (all, [types], set) => {
    const wanted = new Set(set(types!));
    return keep(all, (id) => all.known.get(id)!.holon.instance.some((type) => wanted.has(type)));
  },

  children: along("down", true),
  parents: along("up", true),
  "points-to": along("down", false),
  "pointed-from": along("up", false),

  text: (all, [words]) => {
    const wanted = asWords(words as string);

    return keep(all, (id) => {
      const { holon } = all.known.get(id)!;
      if (isWordLike(all, holon)) return false;

      const said = saying(all, holon);
      return wanted.every((word) => said.includes(word));
    });
  },

  named: (all, [words]) => {
    const wanted = asWords(words as string);

    return keep(all, (id) => {
      const name = all.known.get(id)!.holon.name?.toLocaleLowerCase();
      return name !== undefined && wanted.every((word) => name.includes(word));
    });
  },

  store: (all, [key]) => keep(all, (id) => all.known.get(id)!.store === key),

  types: (all) => keep(all, (id) => all.known.get(id)!.holon.mould !== undefined),

  and: (all, given, set) => {
    const sets = given.map((each) => new Set(set(each)));
    return keep(all, (id) => sets.every((each) => each.has(id)));
  },

  or: (all, given, set) => {
    const sets = given.map((each) => new Set(set(each)));
    return keep(all, (id) => sets.some((each) => each.has(id)));
  },

  not: (all, [left], set) => {
    const out = new Set(set(left!));
    return keep(all, (id) => !out.has(id));
  },

  group: (_all, [grouped], set) => set(grouped!),

  flat: (_all, [given], set) => set(given!),
};

// ---- Evaluating

type Definition = { takes?: Takes[]; native?: string; gives?: Expression };

function called(all: Everything, expression: { call: { $ref: string }; with?: Argument[] }) {
  const holon = all.known.get(expression.call.$ref)?.holon;
  if (!holon) throw new Error(`${expression.call.$ref} is not in the field`);

  const fn = holon.body as Definition;
  const title = holon.name ?? holon.id;

  if (fn.native ? !natives[fn.native] : !fn.gives)
    throw new Error(`${title} is not a function the engine can run`);

  const given = expression.with ?? [];
  const wrong = argumentsProblem(fn.takes ?? [], given);
  if (wrong) throw new Error(`${title} ${wrong}`);

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

// A function of one's own's expression, each argument it names given in.
function substituted(expression: Expression, given: Argument[]): Expression {
  const inner = (value: Argument): Argument => {
    if (typeof value === "string" || "$ref" in value) return value;

    if ("arg" in value) {
      const argument = given[value.arg];
      if (argument === undefined) throw new Error(`there is no argument ${value.arg + 1}`);
      return argument;
    }

    return { call: value.call, ...(value.with ? { with: value.with.map(inner) } : {}) };
  };

  const done = inner(expression);
  if (typeof done === "string") throw new Error("a function gives a set, not words");

  return done;
}

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

  const { fn, given } = called(all, expression);

  const set = fn.gives
    ? gather(all, substituted(fn.gives, given), nested + 1)
    : natives[fn.native!]!(all, given, (argument) => gather(all, argument as Expression, nested + 1));

  sets.set(key, set);

  return set;
}

// ---- Grouping

export type Grouped = {
  by: Axis;
  groups: { value: string; count: number; gathers: Expression }[];
  rest: string[];
};

const nativesHeld = new WeakMap<Everything, Map<string, string>>();

function nativeIds(all: Everything) {
  let found = nativesHeld.get(all);

  if (!found) {
    found = new Map();
    nativesHeld.set(all, found);

    for (const { holon } of all.known.values()) {
      const native = (holon.body as Definition).native;
      if (typeof native === "string" && natives[native] && !found.has(native)) found.set(native, holon.id);
    }
  }

  return found;
}

function valuesAlong(all: Everything, id: string, axis: Axis) {
  const known = all.known.get(id)!;

  if (axis === "type") return known.holon.instance;
  if (axis === "store") return [known.store];

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

  if (fn.gives) return groups(all, substituted(fn.gives, given), nested + 1);

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

    if (fn.gives) return level(all, substituted(fn.gives, given), nested + 1);
    if (fn.native === "flat") return gather(all, expression);
  }

  return topOf(all, gather(all, expression));
}

// ---- Shape

// What is wrong with a value meant as an expression, in its shape, if anything.
// What each function takes is judged as it is called.
export function expressionProblem(value: unknown, nested = 0): string | undefined {
  const form = "an expression is a holon, a call or an argument, as { call: …, with: [ … ] }";

  if (nested >= nesting) return `an expression nests at most ${nesting} deep`;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return form;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);

  if ("$ref" in record)
    return keys.length === 1 && isId(record.$ref) ? undefined : "a holon is given as { $ref: name }";

  if ("arg" in record) {
    return keys.length === 1 && Number.isInteger(record.arg) && (record.arg as number) >= 0
      ? undefined
      : "an argument is given as { arg: i }, counted from 0";
  }

  if (!("call" in record) || keys.some((key) => key !== "call" && key !== "with")) return form;

  const call = record.call as { $ref?: unknown } | null;
  if (typeof call !== "object" || call === null || Object.keys(call).length !== 1 || !isId(call.$ref))
    return "a call names its function as { $ref: name }";

  if (record.with === undefined) return undefined;
  if (!Array.isArray(record.with)) return "what a call gives is a list";

  for (const argument of record.with) {
    if (typeof argument === "string") continue;

    const problem = expressionProblem(argument, nested + 1);
    if (problem) return problem;
  }

  return undefined;
}
