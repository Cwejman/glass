import type { By, Expression } from "../../src/engine/expression.ts";

// A way of looking, taken apart into what it means: the parts it narrows
// by, each a meaning of its own, of this type, held by that, saying these
// words, and the axis it is grouped by, if it is grouped. Put together
// again, the parts stand side by side, as every part narrows the others.

// A grouping's axis, as it is said.
export const axisWords = {
  type: "by what it is",
  holder: "by what holds it",
  store: "by where it is kept",
  strongest: "by what splits it best",
} as const;

export interface Parts {
  parts: Expression[];
  by?: By;
}

export function partsOf(gathers: Expression): Parts {
  const by = "group" in gathers ? gathers.by : undefined;
  const inner = "group" in gathers ? gathers.group : gathers;
  const flat = (e: Expression): Expression[] =>
    "all" in e ? e.all.flatMap(flat) : "everything" in e ? [] : [e];
  return { parts: flat(inner), ...(by ? { by } : {}) };
}

export function together({ parts, by }: Parts): Expression {
  const whole: Expression =
    parts.length === 0 ? { everything: true } : parts.length === 1 ? parts[0]! : { all: parts };
  return by ? { group: whole, by } : whole;
}

// A part said by what it means, each holon it names by its title.
export async function partWords(part: Expression, titleOf: (id: string) => Promise<string>): Promise<string> {
  const idOf = (given: string | { $ref: string }) => (typeof given === "string" ? given : given.$ref);
  const named = (given: string | { $ref: string }) => titleOf(idOf(given)).catch(() => idOf(given));
  if ("instances" in part) return named(part.instances);
  if ("from" in part) return `held by ${await named(part.from)}`;
  if ("pointing" in part) return `pointing at ${await named(part.pointing)}`;
  if ("store" in part) return `kept in ${part.store}`;
  if ("match" in part) return `saying “${part.match}”`;
  if ("named" in part) return "named";
  if ("types" in part) return "types";
  if ("any" in part)
    return (await Promise.all(part.any.map((inner) => partWords(inner, titleOf)))).join(" or ");
  return "a way of looking";
}

// A way of looking, said by its parts, as a title for it.
export async function titleOf(gathers: Expression, titleOfHolon: (id: string) => Promise<string>) {
  const { parts, by } = partsOf(gathers);
  const said = parts.length
    ? (await Promise.all(parts.map((part) => partWords(part, titleOfHolon)))).join(", ")
    : "Everything";
  return by ? `${said}, ${axisWords[by]}` : said;
}
