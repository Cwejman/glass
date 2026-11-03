import type { By, Expression } from "../../src/engine/expression.ts";

// A way of looking, taken apart into what it means: the parts it narrows
// by, each a field and a value, as Type: Brief, Held by: The plan,
// Text: reader, and the axis it is grouped by, if it is grouped. Put
// together again, the parts stand side by side, as every part narrows the
// others. The words here are the ones the search speaks, so a part reads
// the same wherever it is said.

// Each form of a part, by the field it is said as.
export const fields = {
  instances: "Type",
  from: "Held by",
  pointing: "Holds",
  match: "Text",
  store: "Store",
  named: "Has a name",
  types: "Is a type",
} as const;

// A grouping's axis, as it is said: what it groups by, or, left to the
// field, whichever splits it best.
export const axisWords = {
  type: "type",
  holder: "holder",
  store: "store",
  strongest: "auto",
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

export interface Said {
  field: string;
  value: string;
}

// A part said as its field and its value, each holon it names by its
// title; an either, as one field where its parts share one.
export async function partSaid(part: Expression, titleOf: (id: string) => Promise<string>): Promise<Said> {
  const idOf = (given: string | { $ref: string }) => (typeof given === "string" ? given : given.$ref);
  const named = (given: string | { $ref: string }) => titleOf(idOf(given)).catch(() => idOf(given));
  if ("instances" in part) return { field: fields.instances, value: await named(part.instances) };
  if ("from" in part) return { field: fields.from, value: await named(part.from) };
  if ("pointing" in part) return { field: fields.pointing, value: await named(part.pointing) };
  if ("match" in part) return { field: fields.match, value: part.match };
  if ("store" in part) return { field: fields.store, value: part.store };
  if ("named" in part) return { field: fields.named, value: "" };
  if ("types" in part) return { field: fields.types, value: "" };
  if ("any" in part) {
    const each = await Promise.all(part.any.map((inner) => partSaid(inner, titleOf)));
    const one = each.every(({ field }) => field === each[0]!.field);
    return one
      ? { field: each[0]!.field, value: each.map(({ value }) => value).join(" or ") }
      : { field: "Either", value: each.map(inTitle).join(" or ") };
  }
  return { field: "Expression", value: "" };
}

// A part as it reads in a title: a type by its name, any other by its
// field and value.
const inTitle = ({ field, value }: Said) =>
  field === fields.instances ? value : [field.toLocaleLowerCase(), value].filter(Boolean).join(" ");

// A way of looking, said by its parts, as a title for it.
export async function titleOf(gathers: Expression, titleOfHolon: (id: string) => Promise<string>) {
  const { parts, by } = partsOf(gathers);
  const each = await Promise.all(parts.map((part) => partSaid(part, titleOfHolon)));
  const title = each.length ? each.map(inTitle).join(", ") : "Everything";
  const grouped = by === "strongest" ? "grouped automatically" : by ? `grouped by ${axisWords[by]}` : "";
  return [title, grouped].filter(Boolean).join(", ");
}
