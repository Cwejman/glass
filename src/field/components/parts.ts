import type { Id } from "../../store/id.ts";
import type { Argument, By, Expression } from "../../engine/expression.ts";

// An expression, taken apart into what it means: the parts it narrows by,
// each a function and what it is given, said as a field and a value, as
// Type: Brief, Children of: The plan, Text: reader, Not: Store: home; and
// the axis it is grouped by, if it is grouped. Put together again, the
// parts stand side by side under And, grouped by Group by, and no part at
// all is Everything. The words are the functions' own titles, so a part
// reads the same wherever it is said, and a function of one's own reads as
// glass's do.

// A function as a part reads it: what it is called, what it takes, and, for
// one of glass's own, the name the engine runs it by.
export interface Called {
  id: Id;
  title: string;
  takes: string[];
  native?: string;
}

export type Functions = Map<Id, Called>;

export interface Parts {
  parts: Expression[];
  by?: By;
}

// Glass's own function of a name, as an expression's maker needs it.
export const native = (functions: Functions, name: string) =>
  [...functions.values()].find((fn) => fn.native === name)!;

// A function called, given what it takes; given nothing, it says nothing of
// it, so a call is written one way however it was made.
export const call = (fn: Called, ...given: Argument[]): Expression => ({
  call: { $ref: fn.id },
  ...(given.length ? { with: given } : {}),
});

// The holons a set is made of, where it is made of holons only: one, or
// several given together as either.
export function holonsOf(functions: Functions, set: Argument | undefined): { $ref: Id }[] | undefined {
  if (set === undefined || typeof set === "string") return undefined;
  if ("$ref" in set) return [set];
  if (
    calls(functions, set, "or") &&
    (set.with ?? []).every((each) => typeof each !== "string" && "$ref" in each)
  )
    return set.with as { $ref: Id }[];
  return undefined;
}

const calls = (
  functions: Functions,
  e: Argument,
  name: string,
): e is { call: { $ref: Id }; with?: Argument[] } =>
  typeof e !== "string" && "call" in e && functions.get(e.call.$ref)?.native === name;

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

export interface Said {
  field: string;
  value: string;
  // For one of glass's own functions, the name the engine runs it by.
  native?: string;
}

// A part said as its field and its value: the function it calls by its
// title, and what it is given, a holon by its title, several, given
// together as either, joined by or, and a call within by its own field and
// value.
export async function partSaid(
  functions: Functions,
  part: Expression,
  titleOf: (id: Id) => Promise<string>,
): Promise<Said> {
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

async function valueSaid(functions: Functions, given: Argument, titleOf: (id: Id) => Promise<string>) {
  if (typeof given === "string") return given;
  const holons = holonsOf(functions, given);
  if (holons) return (await Promise.all(holons.map(({ $ref }) => titleOf($ref)))).join(" or ");
  const { field, value } = await partSaid(functions, given, titleOf);
  return [field, value].filter(Boolean).join(": ");
}

// A part as it reads in a title: a type by its name, an either or a both
// by what it joins, any other by its field and value.
const inTitle = ({ field, value, native }: Said) =>
  native === "type" || native === "or" || native === "and"
    ? value
    : [field.toLocaleLowerCase(), value].filter(Boolean).join(" ");

// An expression, said by its parts, as a title for it.
export async function titleOf(
  functions: Functions,
  gathers: Expression,
  titleOfHolon: (id: Id) => Promise<string>,
) {
  const { parts, by } = partsOf(functions, gathers);
  const each = await Promise.all(parts.map((part) => partSaid(functions, part, titleOfHolon)));
  const title = each.length ? each.map(inTitle).join(", ") : "Everything";
  const grouped = by === "auto" ? "grouped automatically" : by ? `grouped by ${by}` : "";
  return [title, grouped].filter(Boolean).join(", ");
}

// The functions the field holds, each as a part reads it.
export async function functionsIn(read: {
  name: () => Promise<Id | null>;
  instances: (type: Id) => Promise<Id[]>;
  holon: (id: Id) => Promise<{ id: Id; body: Record<string, unknown> } | null>;
}): Promise<Functions> {
  const type = await read.name();
  const ids = type ? await read.instances(type) : [];
  const found = await Promise.all(ids.map((id) => read.holon(id)));
  return new Map(
    found
      .filter((holon) => !!holon)
      .map(({ id, body }) => [
        id,
        {
          id,
          title: String(body.title ?? id),
          takes: (body.takes as string[] | undefined) ?? [],
          ...(typeof body.native === "string" ? { native: body.native } : {}),
        },
      ]),
  );
}
