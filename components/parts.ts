// An expression, taken apart into what it means: the parts it narrows by, each a
// function and what it is given, said as a field and a value, as Type: Brief; and the
// axis it is grouped by, if it is; and whether it is looked at Flat. Put together again,
// the parts stand side by side under And, within Group by or Flat, and no part at all is
// Everything. The words are the functions' own names, so a function of one's own reads
// as glass's do.

import type { Argument, Axis, Expression } from "../engine/expression.ts";
import type { Offer, Space } from "../interface/component.ts";

// A function as a part reads it.
export type Called = { id: string; title: string; takes: string[]; native?: string; type?: string };

export type Functions = Map<string, Called>;

export type Parts = { parts: Expression[]; by?: Axis; flat?: boolean };

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
  const flat = calls(functions, gathers, "flat");
  const by = grouped ? (gathers.with![1] as Axis) : undefined;
  const inner = grouped || flat ? (gathers.with![0] as Expression) : gathers;

  const parts = calls(functions, inner, "and")
    ? (inner.with as Expression[])
    : calls(functions, inner, "everything")
      ? []
      : [inner];

  return { parts, ...(by ? { by } : {}), ...(flat ? { flat } : {}) };
}

export function together(functions: Functions, { parts, by, flat }: Parts): Expression {
  const whole =
    parts.length === 0
      ? call(native(functions, "everything"))
      : parts.length === 1
        ? parts[0]!
        : call(native(functions, "and"), ...parts);

  if (by) return call(native(functions, "group"), whole, by);

  return flat ? call(native(functions, "flat"), whole) : whole;
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
  const { parts, by, flat } = partsOf(functions, gathers);
  const each = await Promise.all(parts.map((part) => partSaid(functions, part, titleOfHolon)));
  const title = each.length ? each.map(inTitle).join(", ") : "Everything";

  return [title, by ? `grouped by ${by}` : "", flat ? "flat" : ""].filter(Boolean).join(", ");
}

type Ref = { $ref: string };

// What a whole offered holds, read by reference: the whole, then each it holds.
export async function heldBy(space: Pick<Space, "holon">, whole: unknown) {
  const held = whole ? await space.holon((whole as Ref).$ref) : null;
  const ids = ((held?.body.holds ?? []) as Ref[]).map(({ $ref }) => $ref);

  return (await Promise.all(ids.map((id) => space.holon(id)))).filter((holon) => holon !== null);
}

// The functions that can be called: those the entry offers, and the reader's own in the
// home, of the same type.
export async function functionsIn(space: Space, offered: Offer): Promise<Functions> {
  const offeredHere = await heldBy(space, offered.functions);
  const type = offeredHere[0]?.instance[0];
  if (!type) return new Map();

  const own = await Promise.all(
    (await space.read({ instances: type, store: "home" })).map((id) => space.holon(id)),
  );

  return new Map(
    [...offeredHere, ...own]
      .filter((holon) => holon !== null)
      .map(({ id, name, body }) => [
        id,
        {
          id,
          title: name ?? id,
          takes: (body.takes as string[] | undefined) ?? [],
          type,
          ...(typeof body.native === "string" ? { native: body.native } : {}),
        },
      ]),
  );
}
