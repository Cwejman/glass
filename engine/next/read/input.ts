// What a function takes, as reading binds it and judging holds a use to it. A use is a
// holon of a type whose mould declares fn and args; a function, one of a type whose
// mould declares input, the placeholders it takes, each held at its place. What a use
// gives is matched to them in order and by type: an optional placeholder is passed over
// where what comes next does not fit it, or nothing is left.

import { isRef, type Ref, type Value } from "../../../language/expression.ts";
import type { Holon } from "../../../stores/store.ts";
import { after, each, type Maybe } from "./maybe.ts";
import { isClosure, kind } from "./values.ts";

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
// The types of glass not yet given input are known by the name function until they are.
export const isFunctionType = (type: Holon) =>
  declares(type, "input") || (type.name === "function" && Boolean(type.mould));

// The kinds of value a placeholder may take, each known by its type's name.
export const kinds = new Set(["value", "number", "string", "boolean", "list", "record", "holon"]);
export const isKind = (type: Holon) => Boolean(type.name && kinds.has(type.name));

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
): Maybe<boolean> {
  if (!types.length) return true;
  return each(types, false as boolean, (fit, type) => fit || fitsType(type, given, known));
}

function fitsType(
  type: Holon,
  { written, value }: Given,
  known: (id: string) => Maybe<Known | null>,
): Maybe<boolean> {
  const holonIs = (ref: unknown, is: (found: Known) => boolean) =>
    isRef(ref) && after(known(ref.$ref), (found) => Boolean(found && is(found)));

  if (isUseType(type)) return holonIs(written, (found) => found.use);
  return after(value(), (value) => {
    if (isFunctionType(type)) return isClosure(value) || holonIs(value, (found) => found.applicable);
    if (isKind(type)) return type.name === "value" || kind(value) === type.name;
    return holonIs(value, (found) => found.holon.instance.includes(type.id));
  });
}
