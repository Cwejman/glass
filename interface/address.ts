// Where the reader looks is the page's address, the truth of it. One holon is said by
// its route, the names down to it from its store's level, `?place=main/The+wiki/Glass`,
// so an address reads as where one is. Anything else is said as an expression in the
// language, `?look=and(store("main"),type(@…))`. The component it is looked at with,
// where one was chosen, travels beside it as `&with=`.
//
// Saying and reading are pure, given the names they need, so what an address says and
// how it reads back can be tested apart from a page. Both live in the query, so any host
// that serves files serves every address.

import type { Expression } from "../engine/expression.ts";
import { parse, print, routeText, type Names, type Route } from "../language/text.ts";

export type Place = {
  gathers?: Expression;
  argument?: { $ref: string }[];
  component?: { $ref: string };
};

// What an address names before its names are looked up: a route, with the id it last
// found, or an expression's text.
export type Named = ({ route: Route; id?: string } | { look: string }) & { component?: { $ref: string } };

const isHolon = (value: unknown): value is { $ref: string } =>
  typeof value === "object" && value !== null && "$ref" in value;

// The expression a place is: what it gathers, or its holons, several as either.
export function expressionOf({ gathers, argument = [] }: Place, or?: string): Expression {
  if (gathers) return gathers;
  if (argument.length === 1 || !or) return argument[0]!;

  return { call: { $ref: or }, with: argument };
}

// An address escapes only what it must, so what it says stays readable.
export const readable = (text: string) =>
  encodeURIComponent(text)
    .replace(/%20/g, "+")
    .replace(/%(28|29|2C|40|3A|7B|7D|3D|7C|5B|5D|2F|3E)/g, (escaped) => decodeURIComponent(escaped));

const read = (text: string) => decodeURIComponent(text.replace(/\+/g, " "));

// A route as an address says it: the store's key, then each name, a space as +.
const routeSaid = ({ store, names }: Route) =>
  [store ?? "", ...names].map((part) => encodeURIComponent(part).replace(/%20/g, "+")).join("/");

// The address of a place: by its route where it has one, with the id it finds now so a
// route that stops finding it still leads there; else by what it is.
export function addressOf(pathname: string, place: Place, by: { route?: Route; names: Names; or?: string }) {
  const where = by.route
    ? `place=${routeSaid(by.route)}&id=${place.argument![0]!.$ref}`
    : `look=${readable(print(expressionOf(place, by.or), by.names))}`;

  return `${pathname}?${where}${place.component ? `&with=${place.component.$ref}` : ""}`;
}

// What an address names, before its names are looked up. A route is read from the
// query as written, not as the browser reads it, since a name's own / is written %2F
// and must not be read as the next step.
export function namedAt(address: string): Named | undefined {
  const url = new URL(address);
  const by = url.searchParams.get("with");
  const component = by ? { component: { $ref: by } } : {};

  const place = url.search.match(/[?&]place=([^&]*)/)?.[1];
  if (place) {
    const [store, ...names] = place.split("/").map(read);
    const id = url.searchParams.get("id");

    return { route: { ...(store ? { store } : {}), names }, ...(id ? { id } : {}), ...component };
  }

  const look = url.searchParams.get("look");
  return look ? { look, ...component } : undefined;
}

// The text whose names an address needs looked up.
export const textOf = (named: Named) => ("route" in named ? `@${routeText(named.route)}` : named.look);

// The place an address names, its names looked up. A route leads where it finds one
// holon; where it finds none or several, to the id it was written with, if any.
export function placeOf(named: Named, names: Names, or?: string): Place {
  const component = named.component ? { component: named.component } : {};

  if ("route" in named) {
    const found = names.holons(named.route);
    const id = found.length === 1 ? found[0] : named.id;
    if (!id) throw new Error(`the address's route finds ${found.length} holons, not one`);

    return { argument: [{ $ref: id }], ...component };
  }

  const expression = parse(named.look, names) as Expression;
  const holons = isHolon(expression)
    ? [expression]
    : "call" in expression && expression.call.$ref === or && expression.with?.every(isHolon)
      ? (expression.with as { $ref: string }[])
      : undefined;

  return { ...(holons ? { argument: holons } : { gathers: expression }), ...component };
}

export const samePlace = (a: Place | undefined, b: Place) =>
  JSON.stringify([a?.gathers, a?.argument, a?.component]) ===
  JSON.stringify([b.gathers, b.argument, b.component]);
