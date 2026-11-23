// What a function takes, as reading binds it and judging holds a use to it. A use is a
// holon of a type whose mould declares fn and args; a function, one of a type whose
// mould declares input, the placeholders it takes, each held at its place. What a use
// gives is matched to them in order and by type: an optional placeholder is passed over
// where what comes next does not fit it, or nothing is left.

import { isClosure, isRef, kind, type Ref, type Value } from "./values.ts";
import type { Holon } from "../../stores/store.ts";
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

// The kinds of value a placeholder may take: types glass ships, each a kind's name and
// an empty mould, so known by what they are alone, never searched for. A type of
// another store sharing a kind's name, as prose's list does, declares a mould, and is
// held to what is given as any type is, by what it is an instance of.
export const kindNames = ["value", "number", "string", "boolean", "list", "record", "holon"] as const;
export type Kind = (typeof kindNames)[number];

// The kind a type is, if it is one.
export const kindOf = (type: Holon): Kind | undefined =>
  kindNames.includes(type.name as Kind) && type.mould && !Object.keys(type.mould).length
    ? (type.name as Kind)
    : undefined;

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

// What a holon applies or takes, where it is a use or a function: a use's function, args
// and offers, a function's input and body, as their moulds declare them.
export const applying = ({ fn, args, offer, input, body }: Holon["body"]) => [fn, args, offer, input, body];

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
    const of = kindOf(type);
    if (of) return of === "value" || kind(value) === of;
    return holonIs(value, (found) => found.holon.instance.includes(type.id));
  });
}
