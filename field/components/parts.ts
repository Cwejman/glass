import type { Id } from "../../src/store/id.ts";
import type { Argument, By, Expression } from "../../src/engine/expression.ts";

// An expression, taken apart into what it means: the parts it narrows by,
// each a program and what it is given, said as a field and a value, as
// Type: Brief, Children of: The plan, Text: reader, Not: Store: home; and
// the axis it is grouped by, if it is grouped. Put together again, the
// parts stand side by side under And, grouped by Group by, and no part at
// all is Everything. The words are the programs' own titles, so a part
// reads the same wherever it is said, and a program of one's own reads as
// glass's do.

// A program as a part reads it: what it is called, what it takes, and, for
// one of glass's own, the name the engine runs it by.
export interface Called {
  id: Id;
  title: string;
  takes: string[];
  native?: string;
}

export type Programs = Map<Id, Called>;

export interface Parts {
  parts: Expression[];
  by?: By;
}

// Glass's own program of a name, as an expression's maker needs it.
export const native = (programs: Programs, name: string) =>
  [...programs.values()].find((program) => program.native === name)!;

// A program called, given what it takes; given nothing, it says nothing of
// it, so a call is written one way however it was made.
export const call = (program: Called, ...given: Argument[]): Expression => ({
  call: { $ref: program.id },
  ...(given.length ? { with: given } : {}),
});

// The holons a set is made of, where it is made of holons only: one, or
// several given together as either.
export function holonsOf(programs: Programs, set: Argument | undefined): { $ref: Id }[] | undefined {
  if (set === undefined || typeof set === "string") return undefined;
  if ("$ref" in set) return [set];
  if (
    calls(programs, set, "or") &&
    (set.with ?? []).every((each) => typeof each !== "string" && "$ref" in each)
  )
    return set.with as { $ref: Id }[];
  return undefined;
}

const calls = (
  programs: Programs,
  e: Argument,
  name: string,
): e is { call: { $ref: Id }; with?: Argument[] } =>
  typeof e !== "string" && "call" in e && programs.get(e.call.$ref)?.native === name;

export function partsOf(programs: Programs, gathers: Expression): Parts {
  const grouped = calls(programs, gathers, "group");
  const by = grouped ? (gathers.with![1] as By) : undefined;
  const inner = grouped ? (gathers.with![0] as Expression) : gathers;
  const parts = calls(programs, inner, "and")
    ? (inner.with as Expression[])
    : calls(programs, inner, "everything")
      ? []
      : [inner];
  return { parts, ...(by ? { by } : {}) };
}

export function together(programs: Programs, { parts, by }: Parts): Expression {
  const whole =
    parts.length === 0
      ? call(native(programs, "everything"))
      : parts.length === 1
        ? parts[0]!
        : call(native(programs, "and"), ...parts);
  return by ? call(native(programs, "group"), whole, by) : whole;
}

export interface Said {
  field: string;
  value: string;
  // For one of glass's own programs, the name the engine runs it by.
  native?: string;
}

// A part said as its field and its value: the program it calls by its
// title, and what it is given, a holon by its title, several, given
// together as either, joined by or, and a call within by its own field and
// value.
export async function partSaid(
  programs: Programs,
  part: Expression,
  titleOf: (id: Id) => Promise<string>,
): Promise<Said> {
  if ("$ref" in part) return { field: "", value: await titleOf(part.$ref) };
  if ("arg" in part) return { field: "", value: `argument ${part.arg + 1}` };
  const program = programs.get(part.call.$ref);
  const field = program?.title ?? (await titleOf(part.call.$ref));
  const values = await Promise.all((part.with ?? []).map((given) => valueSaid(programs, given, titleOf)));
  return {
    field,
    value: values.join(program?.native === "and" ? " and " : program?.native === "or" ? " or " : ", "),
    ...(program?.native ? { native: program.native } : {}),
  };
}

async function valueSaid(programs: Programs, given: Argument, titleOf: (id: Id) => Promise<string>) {
  if (typeof given === "string") return given;
  const holons = holonsOf(programs, given);
  if (holons) return (await Promise.all(holons.map(({ $ref }) => titleOf($ref)))).join(" or ");
  const { field, value } = await partSaid(programs, given, titleOf);
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
  programs: Programs,
  gathers: Expression,
  titleOfHolon: (id: Id) => Promise<string>,
) {
  const { parts, by } = partsOf(programs, gathers);
  const each = await Promise.all(parts.map((part) => partSaid(programs, part, titleOfHolon)));
  const title = each.length ? each.map(inTitle).join(", ") : "Everything";
  const grouped = by === "auto" ? "grouped automatically" : by ? `grouped by ${by}` : "";
  return [title, grouped].filter(Boolean).join(", ");
}

// The programs the field holds, each as a part reads it.
export async function programsIn(read: {
  name: () => Promise<Id | null>;
  instances: (type: Id) => Promise<Id[]>;
  holon: (id: Id) => Promise<{ id: Id; body: Record<string, unknown> } | null>;
}): Promise<Programs> {
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
