import type { Json } from "../store/canonical.ts";
import { isId, type Id } from "../store/id.ts";
import { isRecord } from "../store/objects.ts";
import type { Field } from "./field.ts";
import { references } from "./references.ts";
import { isType } from "./types.ts";

// An expression is a program given what it takes: data, held in a body
// like any other value, so a holon can gather as easily as it can point.
// Evaluated against the field, it gives the holons it gathers, in the order
// the field holds them. It is one of three forms:
//
//   { "$ref": H }                    the holon H, as a set of one
//   { "call": P, "with": [ … ] }     the program P, given its arguments
//   { "arg": i }                     within a program of one's own, the
//                                    i-th argument it was given
//
// A program is a holon. Glass's own are native, run by the engine: every
// holon, the instances of types, the children and the parents of holons,
// what contains some words, what a store holds, what a store names, the
// types; and, or, not; and group. Each takes sets, which are expressions,
// or words, as a store's key or an axis. A program of one's own gives an
// expression over the arguments it is given, so it is called as glass's
// are, and stands beside them.
//
// A grouping gathers what it is given, and gives it in collections
// besides, one for each value along its axis: by type, by parent, or by
// store, each collection itself an expression, so it can be opened and
// grouped again. Grouped automatically, the axis is the one that splits
// what is gathered into a few groups, evenly filled, covering most of it.
//
// Expressions nest at most `depth` deep, programs of one's own counted.

export type Expression = { $ref: Id } | { call: { $ref: Id }; with?: Argument[] } | { arg: number };
export type Argument = Expression | string;

export const axes = ["type", "parent", "store"] as const;
export type Axis = (typeof axes)[number];
export type By = Axis | "auto";

export const depth = 32;

// What a program takes, each in turn: a set, any number of sets, words, a
// store's key, or an axis.
export type Takes = "set" | "sets" | "words" | "store" | "axis";

// A program as its body holds it: native, run by the engine, or of one's
// own, giving an expression over what it is given.
interface Program {
  title?: string;
  takes?: Takes[];
  native?: string;
  gives?: Expression;
}

export function gather(field: Field, expression: Expression, nested = 0): Id[] {
  if (nested >= depth) throw new Error(`an expression nests at most ${depth} deep`);
  if ("$ref" in expression) return field.known.has(expression.$ref) ? [expression.$ref] : [];
  if ("arg" in expression) throw new Error("an argument is given only within a program of one's own");

  const { program, given } = called(field, expression);
  if (program.gives) return gather(field, substituted(program.gives, given), nested + 1);
  const native = natives[program.native!];
  if (!native) throw new Error(`there is no native program ${program.native}`);
  const set = (argument: Argument) => gather(field, argument as Expression, nested + 1);
  return native(field, given, set);
}

// The program an expression calls, and what it gives it, checked against
// what the program takes.
function called(field: Field, expression: { call: { $ref: Id }; with?: Argument[] }) {
  const holon = field.known.get(expression.call.$ref)?.version;
  if (!holon) throw new Error(`${expression.call.$ref} is not in the field`);
  const program = holon.body as unknown as Program;
  const title = program.title ?? holon.id;
  if (!program.native && !program.gives) throw new Error(`${title} is not a program`);
  const given = expression.with ?? [];
  const wrong = argumentsProblem(program.takes ?? [], given);
  if (wrong) throw new Error(`${title} ${wrong}`);
  return { program, given };
}

// What is wrong with what a program is given, held against what it takes.
function argumentsProblem(takes: Takes[], given: Argument[]): string | undefined {
  const variadic = takes.at(-1) === "sets";
  if (variadic ? given.length < takes.length : given.length !== takes.length)
    return `takes ${takes.length === 0 ? "nothing" : takes.join(", ")}, and was given ${given.length}`;
  return given
    .map((argument, i) => {
      const kind = takes[Math.min(i, takes.length - 1)]!;
      const isSet = typeof argument !== "string";
      if ((kind === "set" || kind === "sets") !== isSet)
        return `takes ${kind === "sets" ? "sets" : `a ${kind}`} as its argument ${i + 1}`;
      if (kind === "axis" && ![...axes, "auto"].includes(argument as string))
        return `groups by ${[...axes, "auto"].join(", ")}`;
      return undefined;
    })
    .find(Boolean);
}

// A program of one's own's expression, each argument it names given in.
function substituted(expression: Expression, given: Argument[]): Expression {
  const inner = (value: Argument): Argument => {
    if (typeof value === "string") return value;
    if ("arg" in value) {
      const argument = given[value.arg];
      if (argument === undefined) throw new Error(`there is no argument ${value.arg + 1}`);
      return argument;
    }
    if ("$ref" in value) return value;
    return { call: value.call, ...(value.with ? { with: value.with.map(inner) } : {}) };
  };
  const done = inner(expression);
  if (typeof done === "string") throw new Error("a program gives a set, not words");
  return done;
}

// Glass's own programs, by the name their holons give them.
type Native = (field: Field, given: Argument[], set: (argument: Argument) => Id[]) => Id[];

const held = (field: Field) => [...field.known.values()].map(({ version }) => version);
const kept = (field: Field, keep: (id: Id) => boolean) =>
  held(field)
    .map(({ id }) => id)
    .filter(keep);

const natives: Record<string, Native> = {
  everything: (field) => kept(field, () => true),
  type: (field, [types], set) => {
    const of = new Set(set(types!));
    return held(field)
      .filter(({ instance }) => instance.some((type) => of.has(type)))
      .map(({ id }) => id);
  },
  children: (field, [parents], set) => {
    const children = new Set(
      set(parents!).flatMap((id) => references(field.known.get(id)!.version.body).map((each) => each.id)),
    );
    return kept(field, (id) => children.has(id));
  },
  parents: (field, [children], set) => {
    const of = new Set(set(children!));
    return held(field)
      .filter(({ body }) => references(body).some(({ id }) => of.has(id)))
      .map(({ id }) => id);
  },
  text: (field, [words]) => {
    const wanted = wordsOf(words as string);
    return held(field)
      .filter(({ body }) => says(body, wanted))
      .map(({ id }) => id);
  },
  store: (field, [key]) =>
    [...field.known.values()].filter((known) => known.key === key).map(({ version }) => version.id),
  named: (field) => {
    const named = new Set(field.stores.flatMap(({ names }) => Object.values(names)));
    return kept(field, (id) => named.has(id));
  },
  types: (field) =>
    held(field)
      .filter(({ body }) => isType(body))
      .map(({ id }) => id),
  and: (field, given, set) => {
    const sets = given.map((each) => new Set(set(each)));
    return kept(field, (id) => sets.every((each) => each.has(id)));
  },
  or: (field, given, set) => {
    const sets = given.map((each) => new Set(set(each)));
    return kept(field, (id) => sets.some((each) => each.has(id)));
  },
  not: (field, [left], set) => {
    const out = new Set(set(left!));
    return kept(field, (id) => !out.has(id));
  },
  group: (_field, [grouped], set) => set(grouped!),
};

// The native programs a field holds, by their names, so an expression can
// be made of them; the first of each name, as the field orders them.
const nativesOf = new WeakMap<Field, Map<string, Id>>();
export function nativeIds(field: Field): Map<string, Id> {
  if (!nativesOf.has(field)) {
    const found = new Map<string, Id>();
    for (const { id, body } of held(field)) {
      const native = (body as unknown as Program).native;
      if (typeof native === "string" && !found.has(native)) found.set(native, id);
    }
    nativesOf.set(field, found);
  }
  return nativesOf.get(field)!;
}

// The words a search is made of, set in one case, so a search finds a word
// however it was written.
const wordsOf = (text: string) => text.toLocaleLowerCase().split(/\s+/).filter(Boolean);

// Whether a body says each of the words wanted, anywhere in what it holds
// as text: its title, its prose, any string within it, but never the ids
// it points by, the code or style it runs, or the file it was born from.
const unsaid = new Set(["$ref", "@", "code", "source", "css", "from"]);
function says(body: unknown, wanted: string[]) {
  const text: string[] = [];
  const walk = (value: unknown, key?: string) => {
    if (key !== undefined && unsaid.has(key)) return;
    if (typeof value === "string") return text.push(value);
    if (Array.isArray(value)) return value.forEach((inner) => walk(inner));
    if (isRecord(value)) for (const [inner, held] of Object.entries(value)) walk(held, inner);
  };
  walk(body);
  const said = text.join(" ").toLocaleLowerCase();
  return wanted.every((word) => said.includes(word));
}

// A grouping's collections: the axis it groups by, each collection with
// the value it shares, how many it holds and the expression that gathers
// it, the larger first; and what has no value on the axis. What is not a
// grouping has none; a program of one's own that gives one is looked
// through to it.
export interface Grouped {
  by: Axis;
  groups: { value: string; count: number; gathers: Expression }[];
  rest: Id[];
}

export function groups(field: Field, expression: Expression, nested = 0): Grouped | null {
  if (!("call" in expression) || nested >= depth) return null;
  const { program, given } = called(field, expression);
  if (program.gives) return groups(field, substituted(program.gives, given), nested + 1);
  if (program.native !== "group") return null;

  const [inner, asked] = given as [Expression, By];
  const gathered = gather(field, inner);
  const splits = new Map(
    (asked === "auto" ? axes : [asked]).map((axis) => [axis, splitBy(field, gathered, axis)]),
  );
  const strong = (axis: Axis) => strength(splits.get(axis)!, gathered.length);
  const by =
    asked === "auto" ? axes.reduce((best, axis) => (strong(axis) > strong(best) ? axis : best)) : asked;

  const { values, rest } = splits.get(by)!;
  // Where nothing splits it, what is gathered is given as it is.
  if (asked === "auto" && values.size < 2) return { by, groups: [], rest: gathered };
  return {
    by,
    groups: [...values]
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([value, ids]) => ({ value, count: ids.length, gathers: narrowed(field, inner, by, value) })),
    rest,
  };
}

// What a grouping gathers, narrowed to one value along its axis: what it
// was given and the value side by side, however deep.
function narrowed(field: Field, inner: Expression, by: Axis, value: string): Expression {
  const ids = nativeIds(field);
  const call = (name: string, ...given: Argument[]): Expression => ({
    call: { $ref: ids.get(name)! },
    with: given,
  });
  const narrow =
    by === "type"
      ? call("type", { $ref: value })
      : by === "parent"
        ? call("children", { $ref: value })
        : call("store", value);
  const calls = (e: Expression, name: string) => "call" in e && e.call.$ref === ids.get(name);
  if (calls(inner, "everything")) return narrow;
  return call("and", ...(calls(inner, "and") ? (inner as { with: Argument[] }).with : [inner]), narrow);
}

// The values a set has along an axis, each with the holons that have it, in
// the order they first appear; and the holons that have none that tells
// them apart.
function splitBy(field: Field, gathered: Id[], axis: Axis) {
  const values = new Map<string, Id[]>();
  const rest: Id[] = [];
  for (const id of gathered) {
    const known = field.known.get(id)!;
    const along =
      axis === "type"
        ? known.version.instance
        : axis === "parent"
          ? [...new Set((field.holders.get(id) ?? []).map(({ from }) => from))]
          : [known.key];
    for (const value of along) {
      if (!values.has(value)) values.set(value, []);
      values.get(value)!.push(id);
    }
  }
  // A value every holon here shares says nothing here, as the one a
  // collection was opened by.
  for (const [value, ids] of values) if (ids.length === gathered.length) values.delete(value);
  const valued = new Set([...values.values()].flat());
  return { values, rest: gathered.filter((id) => !valued.has(id)) };
}

// How well an axis splits a set: into a few groups, three to a dozen,
// covering most of it, the more evenly the better. One group, or none,
// says nothing; two say little; past a dozen, the groups grow too many to
// take in at once, and fast. Evenness counts for half, since a field is
// rarely even: most of glass's holons are briefs.
function strength({ values, rest }: ReturnType<typeof splitBy>, total: number) {
  const counts = [...values.values()].map((ids) => ids.length);
  if (counts.length < 2 || total === 0) return 0;
  const sum = counts.reduce((a, b) => a + b, 0);
  const entropy = -counts.reduce((h, count) => h + (count / sum) * Math.log2(count / sum), 0);
  const evenness = entropy / Math.log2(counts.length);
  const coverage = (total - rest.length) / total;
  const few = counts.length === 2 ? 0.6 : Math.min(1, (12 / counts.length) ** 2);
  return coverage * few * (0.5 + 0.5 * evenness);
}

// What is wrong with a value meant as an expression, in its shape, if
// anything; what each program takes is judged as it is called.
export function expressionProblem(value: Json | undefined, nested = 0): string | undefined {
  if (nested >= depth) return `an expression nests at most ${depth} deep`;
  if (!isRecord(value)) return "an expression is a holon, a call or an argument, as { call: …, with: [ … ] }";
  const keys = Object.keys(value);
  if ("$ref" in value)
    return keys.length === 1 && isId(value.$ref) ? undefined : "a holon is given as { $ref: id }";
  if ("arg" in value)
    return keys.length === 1 && Number.isInteger(value.arg) && (value.arg as number) >= 0
      ? undefined
      : "an argument is given as { arg: i }, counted from 0";
  if (!("call" in value) || keys.some((key) => key !== "call" && key !== "with"))
    return "an expression is a holon, a call or an argument, as { call: …, with: [ … ] }";
  const call = value.call;
  if (!isRecord(call) || Object.keys(call).length !== 1 || !isId(call.$ref))
    return "a call names its program as { $ref: id }";
  if (value.with === undefined) return undefined;
  if (!Array.isArray(value.with)) return "what a call gives is a list";
  return value.with
    .map((argument) => (typeof argument === "string" ? undefined : expressionProblem(argument, nested + 1)))
    .find(Boolean);
}
