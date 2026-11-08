// Where the reader looks is the page's address, the truth of it: an expression said
// as text, and the component it is looked at with, where one was chosen. These are
// pure, so what the address says and how it reads back can be tested apart from a page.

import type { Argument, Expression } from "../engine/expression.ts";
import { parse, print } from "./syntax.ts";

export type Place = {
  gathers?: Expression;
  argument?: { $ref: string }[];
  component?: { $ref: string };
};

// What an address needs of the functions: their titles both ways, and which one is Or.
export type Titles = { titles: Map<string, string>; byTitle: Map<string, string[]>; or?: string };

const isHolon = (argument: Argument): argument is { $ref: string } =>
  typeof argument !== "string" && "$ref" in argument;

// The text a place is said by. Holons said one by one are a place of several.
export function said({ gathers, argument = [] }: Place, { titles, or }: Titles) {
  if (gathers) return print(gathers, titles);
  if (argument.length === 1 || !or) return print(argument[0]!, titles);

  return print({ call: { $ref: or }, with: argument }, titles);
}

// An address escapes only what it must, so what it says stays readable.
export const readable = (text: string) =>
  encodeURIComponent(text)
    .replace(/%20/g, "+")
    .replace(/%(28|29|2C|40|24|3A)/g, (escaped) => decodeURIComponent(escaped));

export const addressOf = (pathname: string, place: Place, functions: Titles) =>
  `${pathname}?look=${readable(said(place, functions))}${place.component ? `&with=${place.component.$ref}` : ""}`;

// The place an address names, if it names one that can be read.
export function placeAt(address: string, { byTitle, or }: Titles): Place | undefined {
  const query = new URL(address).searchParams;
  const looked = query.get("look");

  if (!looked) return undefined;

  const expression = parse(looked, byTitle);
  const by = query.get("with");

  const holons = isHolon(expression)
    ? [expression]
    : "call" in expression && expression.call.$ref === or && expression.with?.every(isHolon)
      ? (expression.with as { $ref: string }[])
      : undefined;

  return {
    ...(holons ? { argument: holons } : { gathers: expression }),
    ...(by ? { component: { $ref: by } } : {}),
  };
}

export const samePlace = (a: Place | undefined, b: Place) =>
  JSON.stringify([a?.gathers, a?.argument, a?.component]) ===
  JSON.stringify([b.gathers, b.argument, b.component]);
