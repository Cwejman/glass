// An expression, taken apart into what it means: the parts it narrows by, each a
// function and what it is given, said as a field and a value, as Type: Brief; and the
// axis it is grouped by, if it is grouped. Put together again, the parts stand side by
// side under And, grouped by Group by, and no part at all is Everything. The words are
// the functions' own names, so a function of one's own reads as glass's do.

import type { Argument, By, Expression } from "../../engine/expression.ts";
import { ownStores, type Space } from "../../interface/component.ts";

// A function as a part reads it.
export type Called = { id: string; title: string; takes: string[]; native?: string };

export type Functions = Map<string, Called>;

export type Parts = { parts: Expression[]; by?: By };

export const native = (functions: Functions, name: string) =>
  [...functions.values()].find((fn) => fn.native === name)!;

export const call = (fn: Called, ...given: Argument[]): Expression => ({
  call: { $ref: fn.id },
  ...(given.length ? { with: given } : {}),
});

const calls = (
  functions: Functions,
  value: Argument,
  name: string,
): value is { call: { $ref: string }; with?: Argument[] } =>
  typeof value !== "string" && "call" in value && functions.get(value.call.$ref)?.native === name;

// The holons a set is made of, where it is made of holons only.
export function holonsOf(functions: Functions, set: Argument | undefined): { $ref: string }[] | undefined {
  if (set === undefined || typeof set === "string") return undefined;
  if ("$ref" in set) return [set];

  const allHolons =
    calls(functions, set, "or") &&
    (set.with ?? []).every((each) => typeof each !== "string" && "$ref" in each);

  return allHolons ? (set.with as { $ref: string }[]) : undefined;
}

export function partsOf(functions: Functions, gathers: Expression): Parts {
  const grouped = calls(functions, gathers, "group");
  const by = grouped ? (gathers.with![1] as By) : undefined;
  const inner = grouped ? (gathers.with![0] as Expression) : gathers;

  const parts = calls(functions, inner, "and")
    ? (inner.with as Expression[])
    : calls(functions, inner, "everything")
      ? []
      : [inner];

  return { parts, ...(by ? { by } : {}) };
}

export function together(functions: Functions, { parts, by }: Parts): Expression {
  const whole =
    parts.length === 0
      ? call(native(functions, "everything"))
      : parts.length === 1
        ? parts[0]!
        : call(native(functions, "and"), ...parts);

  return by ? call(native(functions, "group"), whole, by) : whole;
}

export type Said = { field: string; value: string; native?: string };

type TitleOf = (id: string) => Promise<string>;

// A part said as its field and its value.
export async function partSaid(functions: Functions, part: Expression, titleOf: TitleOf): Promise<Said> {
  if ("$ref" in part) return { field: "", value: await titleOf(part.$ref) };
  if ("arg" in part) return { field: "", value: `argument ${part.arg + 1}` };

  const fn = functions.get(part.call.$ref);
  const field = fn?.title ?? (await titleOf(part.call.$ref));
  const values = await Promise.all((part.with ?? []).map((given) => valueSaid(functions, given, titleOf)));

  return {
    field,
    value: values.join(fn?.native === "and" ? " and " : fn?.native === "or" ? " or " : ", "),
    ...(fn?.native ? { native: fn.native } : {}),
  };
}

async function valueSaid(functions: Functions, given: Argument, titleOf: TitleOf) {
  if (typeof given === "string") return given;

  const holons = holonsOf(functions, given);
  if (holons) return (await Promise.all(holons.map(({ $ref }) => titleOf($ref)))).join(" or ");

  const { field, value } = await partSaid(functions, given, titleOf);
  return [field, value].filter(Boolean).join(": ");
}

const inTitle = ({ field, value, native }: Said) =>
  native === "type" || native === "or" || native === "and"
    ? value
    : [field.toLocaleLowerCase(), value].filter(Boolean).join(" ");

// An expression, said by its parts, as a title for it.
export async function titleOf(functions: Functions, gathers: Expression, titleOfHolon: TitleOf) {
  const { parts, by } = partsOf(functions, gathers);
  const each = await Promise.all(parts.map((part) => partSaid(functions, part, titleOfHolon)));
  const title = each.length ? each.map(inTitle).join(", ") : "Everything";
  const grouped = by === "auto" ? "grouped automatically" : by ? `grouped by ${by}` : "";

  return [title, grouped].filter(Boolean).join(", ");
}

// The functions that can be called: glass's own, and the reader's.
export async function functionsIn(space: Space): Promise<Functions> {
  const [type] = await space.read({ named: "function", store: "glass" });
  if (!type) return new Map();

  const ids = (await Promise.all(ownStores.map((store) => space.read({ instances: type, store })))).flat();
  const found = await Promise.all(ids.map((id) => space.holon(id)));

  return new Map(
    found
      .filter((holon) => holon !== null)
      .map(({ id, name, body }) => [
        id,
        {
          id,
          title: name ?? id,
          takes: (body.takes as string[] | undefined) ?? [],
          ...(typeof body.native === "string" ? { native: body.native } : {}),
        },
      ]),
  );
}
