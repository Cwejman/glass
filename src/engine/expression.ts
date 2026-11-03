import type { Json } from "../store/canonical.ts";
import { isId, type Id } from "../store/id.ts";
import { isRecord } from "../store/objects.ts";
import type { Field } from "./field.ts";
import { references } from "./references.ts";
import { isType } from "./types.ts";

// An expression is data: a value that says what to gather from the field,
// held in a body like any other value, so a holon can gather as easily as
// it can point. Evaluated against the field, it gives the holons it gathers,
// in the order the field holds them. Each form names one way of looking,
// along the few axes every holon has: what it is, how it connects, and
// where it enters.
//
//   { "everything": true }  every holon in the field
//   { "instances": T }      the instances of the type T
//   { "types": true }       every type
//   { "pointing": H }       what points at the holon H
//   { "from": H }           what the holon H points at
//   { "store": key }        what the store holds
//   { "named": true }       every holon a store gives a name
//   { "match": words }      every holon whose body says each of the words
//   { "all": [ … ] }        what every expression in the list gathers
//   { "any": [ … ] }        what any expression in the list gathers
//   { "group": E, "by": axis }   what E gathers, in collections
//
// A grouping gathers what its expression gathers, and gives it in
// collections besides, one for each value along its axis: by type, by the
// holon that points at it, or by store, each collection itself a way of
// looking, so it can be opened and grouped again. By the strongest, the
// axis is the one that splits what is gathered into a few groups, evenly
// filled, covering most of it.
//
// A holon is given by its id or by a reference to it, `{ "$ref": id }`, so
// an expression in a body points into the field as plainly as any value.
// Expressions nest at most `depth` deep.

export type Expression =
  | { everything: true }
  | { instances: Given }
  | { types: true }
  | { pointing: Given }
  | { from: Given }
  | { store: string }
  | { named: true }
  | { match: string }
  | { all: Expression[] }
  | { any: Expression[] }
  | { group: Expression; by: By };

export const axes = ["type", "holder", "store"] as const;
export type Axis = (typeof axes)[number];
export type By = Axis | "strongest";

type Given = Id | { $ref: Id };

const idOf = (given: Given) => (typeof given === "string" ? given : given.$ref);

export const depth = 32;

export function gather(field: Field, expression: Expression): Id[] {
  const held = [...field.known.values()].map(({ version }) => version);

  if ("everything" in expression) return held.map(({ id }) => id);
  if ("group" in expression) return gather(field, expression.group);
  if ("from" in expression) {
    const holder = field.known.get(idOf(expression.from))?.version;
    if (!holder) return [];
    return [...new Set(references(holder.body).map(({ id }) => id))].filter((id) => field.known.has(id));
  }
  if ("store" in expression)
    return [...field.known.values()]
      .filter(({ key }) => key === expression.store)
      .map(({ version }) => version.id);
  if ("instances" in expression) {
    const type = idOf(expression.instances);
    return held.filter(({ instance }) => instance.includes(type)).map(({ id }) => id);
  }
  if ("types" in expression) return held.filter(({ body }) => isType(body)).map(({ id }) => id);
  if ("pointing" in expression) {
    const target = idOf(expression.pointing);
    return held.filter(({ body }) => references(body).some(({ id }) => id === target)).map(({ id }) => id);
  }
  if ("match" in expression) {
    const wanted = wordsOf(expression.match);
    return held.filter(({ body }) => says(body, wanted)).map(({ id }) => id);
  }
  if ("named" in expression) {
    const named = new Set(field.stores.flatMap(({ names }) => Object.values(names)));
    return held.filter(({ id }) => named.has(id)).map(({ id }) => id);
  }

  const parts = ("all" in expression ? expression.all : expression.any).map(
    (inner) => new Set(gather(field, inner)),
  );
  const kept = (id: Id) =>
    "all" in expression ? parts.every((part) => part.has(id)) : parts.some((part) => part.has(id));
  return held.map(({ id }) => id).filter(kept);
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
// the value it shares, how many it holds and the way of looking that
// gathers it, the larger first; and what has no value on the axis. What is
// not a grouping has none.
export interface Grouped {
  by: Axis;
  groups: { value: string; count: number; gathers: Expression }[];
  rest: Id[];
}

export function groups(field: Field, expression: Expression): Grouped | null {
  if (!("group" in expression)) return null;
  const gathered = gather(field, expression.group);
  const splits = new Map(
    (expression.by === "strongest" ? axes : [expression.by]).map((axis) => [
      axis,
      splitBy(field, gathered, axis),
    ]),
  );
  const strong = (axis: Axis) => strength(splits.get(axis)!, gathered.length);
  const by =
    expression.by === "strongest"
      ? axes.reduce((best, axis) => (strong(axis) > strong(best) ? axis : best))
      : expression.by;

  const { values, rest } = splits.get(by)!;
  // Where nothing splits it, what is gathered is given as it is.
  if (expression.by === "strongest" && values.size < 2) return { by, groups: [], rest: gathered };
  const narrowed = (value: string): Expression => {
    const narrow: Expression =
      by === "type"
        ? { instances: { $ref: value } }
        : by === "holder"
          ? { from: { $ref: value } }
          : { store: value };
    // The steps a collection is narrowed by stand side by side, however deep.
    const inner = expression.group;
    return "everything" in inner ? narrow : { all: [...("all" in inner ? inner.all : [inner]), narrow] };
  };
  return {
    by,
    groups: [...values]
      .sort(([, a], [, b]) => b.length - a.length)
      .map(([value, ids]) => ({ value, count: ids.length, gathers: narrowed(value) })),
    rest,
  };
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
        : axis === "holder"
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

// What is wrong with a value meant as an expression, if anything.
export function expressionProblem(value: Json | undefined, nested = 0): string | undefined {
  if (nested >= depth) return `an expression nests at most ${depth} deep`;
  if (isRecord(value) && "group" in value) {
    if (Object.keys(value).some((key) => key !== "group" && key !== "by"))
      return "a grouping holds only what it groups and what it groups by";
    if (!(axes as readonly unknown[]).includes(value.by) && value.by !== "strongest")
      return `a grouping groups by ${[...axes, "strongest"].join(", ")}`;
    return expressionProblem(value.group, nested + 1);
  }
  if (!isRecord(value) || Object.keys(value).length !== 1)
    return "an expression is one form, as { instances: … }";
  const [form, given] = Object.entries(value)[0]!;

  switch (form) {
    case "instances":
    case "pointing":
    case "from":
      return isGiven(given) ? undefined : `${form} names a holon, by its id or a reference to it`;
    case "store":
      return typeof given === "string" ? undefined : "store names a store, as glass";
    case "match":
      return typeof given === "string" && wordsOf(given).length > 0
        ? undefined
        : "match is the words to look for, as a string";
    case "everything":
    case "types":
    case "named":
      return given === true ? undefined : `${form} is written ${form}: true`;
    case "all":
    case "any":
      if (!Array.isArray(given) || given.length === 0) return `${form} holds a list of expressions`;
      return given.map((inner) => expressionProblem(inner as Json, nested + 1)).find(Boolean);
    default:
      return `there is no expression ${form}`;
  }
}

const isGiven = (value: unknown): value is Given =>
  isId(value) || (isRecord(value) && Object.keys(value).length === 1 && isId(value.$ref));
