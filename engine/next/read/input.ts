// What a function takes, as reading binds it and judging holds a use to it. A use is a
// holon of a type whose mould declares fn and args; a function, one of a type whose
// mould declares input, the placeholders it takes, each held at its place. What a use
// gives is matched to them in order and by type: an optional placeholder is passed over
// where what comes next does not fit it, or nothing is left.

import { isClosure, isRef, kind, type Ref, type Value } from "./values.ts";
import type { Holon } from "../../../stores/store.ts";
import type { Field } from "./field.ts";
import { after, each, type Maybe } from "./maybe.ts";

// A reference as written in a holon's body, holding or not, optional or not.
export type Link = Ref & { $holds?: boolean; $optional?: boolean };

// A holon, with its types, and what they make it.
export type Known = { holon: Holon; types: Holon[]; use: boolean; applicable: boolean };

// A placeholder of a function's input: whether it may be left unfilled, its types, and
// whether it takes a use itself rather than what the use gives.
export type Place = { id: string; optional: boolean; types: Holon[]; itself: boolean };

// What a function is given for one argument: as written, for a placeholder that takes a
// use itself, and what it gives, worked out only if asked.
export type Given = { written: unknown; value: () => Maybe<Value> };

const declares = (type: Holon, key: string) => Boolean(type.mould && key in type.mould);
export const isUseType = (type: Holon) => declares(type, "fn") && declares(type, "args");
export const isFunctionType = (type: Holon) => declares(type, "input");

// A component is a function drawn rather than worked out: applied, it gives a drawing of
// itself (values.ts), or what its body gives where it holds one. Its type is known by
// its name, as glass ships it.
export const isComponentType = (type: Holon) => isFunctionType(type) && type.name === "component";

// The kinds of value a placeholder may take: types glass ships, each of an empty mould.
// They are found once, a read or a commit, by their names, and known after by their ids,
// so a type of another store that shares a kind's name, as main's list does, is never
// taken for it. A field without them has no kinds: a placeholder's type is then held to
// what is given as any type is, by what it is an instance of.
export const kindNames = ["value", "number", "string", "boolean", "list", "record", "holon"] as const;
export type Kind = (typeof kindNames)[number];
export type Kinds = ReadonlyMap<string, Kind>;

const isKindName = (name: string | undefined): name is Kind => kindNames.includes(name as Kind);
const shipped = (type: Holon) =>
  isKindName(type.name) && Boolean(type.mould) && !Object.keys(type.mould!).length;

// The kinds among the holons given.
export const kindsAmong = (holons: Iterable<Holon>): Kinds =>
  new Map([...holons].flatMap((type) => (shipped(type) ? [[type.id, type.name as Kind] as const] : [])));

// The kinds of a field, asked once of its facts by name.
export async function kindsIn(field: Pick<Field, "facts" | "holon">): Promise<Kinds> {
  const named = await Promise.all(kindNames.map((name) => field.facts({ a: "name", v: name })));
  const found = await Promise.all(named.flat().map(async ({ e }) => (await field.holon(e))?.holon));
  return kindsAmong(found.filter((type): type is Holon => Boolean(type)));
}

export const isKind = (type: Holon, kinds: Kinds) => kinds.has(type.id);

export const knownAs = (holon: Holon, types: Holon[]): Known => ({
  holon,
  types,
  use: types.some(isUseType),
  applicable: types.some(isFunctionType),
});

export const placeAs = ({ $ref: id, $optional }: Link, { types }: Known): Place => ({
  id,
  optional: $optional === true,
  types,
  itself: types.some(isUseType),
});

// The placeholders of a function, as its input lists them; none where it declares no
// input, so what it is given is not matched.
export const inputOf = (fn: Holon): Link[] | undefined =>
  Array.isArray(fn.body.input) ? fn.body.input.filter(isRef) : undefined;

export type Matched = { taking: (number | undefined)[]; taken: number };

// Which argument each placeholder takes, by its index, or none: a required one the next
// left, an optional one the next only where it fits. With how many were taken, so what
// is left over is known.
export function matched<G>(
  input: readonly Place[],
  given: readonly G[],
  fits: (place: Place, arg: G) => Maybe<boolean>,
): Maybe<Matched> {
  const taking: (number | undefined)[] = [];

  const taken = each(input, 0, (next, place) => {
    const arg = given[next];
    return after(arg !== undefined && (!place.optional || fits(place, arg)), (fit) => {
      taking.push(fit ? next : undefined);
      return fit ? next + 1 : next;
    });
  });
  return after(taken, (taken) => ({ taking, taken }));
}

// Whether what is given fits a placeholder of these types, any of them; of none, it
// takes anything.
export function fits(
  types: readonly Holon[],
  given: Given,
  known: (id: string) => Maybe<Known | null>,
  kinds: Kinds,
): Maybe<boolean> {
  if (!types.length) return true;
  return each(types, false as boolean, (fit, type) => fit || fitsType(type, given, known, kinds));
}

function fitsType(
  type: Holon,
  { written, value }: Given,
  known: (id: string) => Maybe<Known | null>,
  kinds: Kinds,
): Maybe<boolean> {
  const holonIs = (ref: unknown, is: (found: Known) => boolean) =>
    isRef(ref) && after(known(ref.$ref), (found) => Boolean(found && is(found)));

  if (isUseType(type)) return holonIs(written, (found) => found.use);
  return after(value(), (value) => {
    if (isFunctionType(type)) return isClosure(value) || holonIs(value, (found) => found.applicable);
    const of = kinds.get(type.id);
    if (of) return of === "value" || kind(value) === of;
    return holonIs(value, (found) => found.holon.instance.includes(type.id));
  });
}
