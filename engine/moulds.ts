// A type is a holon with a mould: what its instances hold, field by field, each
// said in prose beside the shape the engine checks. A field is where holons
// connect, so it carries both.
//
// This is the one home of what a type says: the mould a holon's types give together,
// which of its references hold, what is wrong with a mould, and with a body held
// against the moulds of its types, and which holon is a store's root. These are pure
// judgements: they answer in words, or with nothing.

import { canonical } from "../integrations/glass/canonical.ts";
import type { Holon } from "../integrations/glass/store.ts";
import { expressionProblem } from "../language/expression.ts";

export type Shape =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "code"
  | "ref"
  | "expression"
  | "json"
  | { list: Shape }
  | { set: Shape }
  | { [field: string]: Shape };

export type Key = { says: string; shape: Shape; optional?: boolean; holds?: boolean };

export type Mould = Record<string, Key>;

type Values = Record<string, unknown>;

// What a holon's types together say of its fields, given the types as the field has
// them; one the field lacks says nothing. A field any of them holds by, holds.
export function mouldOf(types: readonly (Pick<Holon, "mould"> | null | undefined)[]): Mould {
  const together: Mould = {};

  for (const type of types) {
    for (const [key, field] of Object.entries((type?.mould ?? {}) as Mould)) {
      together[key] = { ...field, holds: field.holds || together[key]?.holds };
    }
  }

  return together;
}

// ---- References

// A holon connects to others from its body. A reference is written the same way
// wherever it stands, `{ "$ref": id }`, so it is seen without knowing the type. Any
// string under $ref is a reference here, a handle or a mistake as well as an id: whether
// it is an id is judged, so a wrong one is refused rather than passed over.
export type Reference = { id: string; key: string; holds: boolean };

type Ref = { $ref: string; $holds?: boolean };

export const isRef = (value: unknown): value is Ref =>
  typeof value === "object" && value !== null && typeof (value as { $ref?: unknown }).$ref === "string";

// A reference holds, making the other a part, or only points. It says so itself with
// $holds, or else its key's field in the mould says.
export const holding = (ref: Ref, field: { holds?: boolean } | undefined) =>
  ref.$holds ?? field?.holds === true;

// Every reference in a body, in the order the body holds them, under its top key.
export function references(body: Holon["body"], mould: Readonly<Record<string, { holds?: boolean }>> = {}) {
  const found: Reference[] = [];

  function walk(value: unknown, key: string) {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
    } else if (isRef(value)) {
      found.push({ id: value.$ref, key, holds: holding(value, mould[key]) });
    } else if (typeof value === "object" && value !== null) {
      for (const inner of Object.values(value)) walk(inner, key);
    }
  }

  for (const [key, value] of Object.entries(body)) walk(value, key);

  return found;
}

// What a holon holds, as parts.
export const partsOf = (body: Holon["body"], mould: Mould = {}) =>
  references(body, mould)
    .filter(({ holds }) => holds)
    .map(({ id }) => id);

// ---- Roots

// A store's root is its holon of the type store: the type so named, with a mould. It
// holds the store's top and names what the store stands on. The type is known by its
// name for now, the one word read literally; roots found by address come with names.
export const isRoot = (holon: Holon, typeOf: (id: string) => Holon | null | undefined) =>
  holon.instance.some((id) => {
    const type = typeOf(id);
    return type?.name === "store" && type.mould !== undefined;
  });

// ---- Judging

const isRecord = (value: unknown): value is Values =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fits: Record<string, (value: unknown) => boolean> = {
  string: (value) => typeof value === "string",
  number: (value) => typeof value === "number",
  boolean: (value) => typeof value === "boolean",
  code: (value) => typeof value === "string",
  date: (value) => typeof value === "string" && !Number.isNaN(Date.parse(value)),
  ref: isRef,
  expression: (value) => expressionProblem(value) === undefined,
  json: () => true,
};

function shapeProblem(shape: unknown, at: string): string | undefined {
  if (typeof shape === "string") return shape in fits ? undefined : `${at} has no shape ${shape}`;
  if (!isRecord(shape) || Object.keys(shape).length === 0) return `${at} has no shape`;

  for (const [key, inner] of Object.entries(shape)) {
    const problem = shapeProblem(inner, `${at}.${key}`);
    if (problem) return problem;
  }

  return undefined;
}

export function mouldProblem(mould: unknown): string | undefined {
  if (!isRecord(mould)) return "a mould is a set of fields";

  for (const [key, field] of Object.entries(mould)) {
    if (!isRecord(field)) return `${key} is not a field`;
    if (typeof field.says !== "string" || field.says.trim() === "") return `${key} says nothing in prose`;

    const problem = shapeProblem(field.shape, key);
    if (problem) return problem;
  }

  return undefined;
}

function valueProblem(value: unknown, shape: Shape, at: string): string | undefined {
  if (typeof shape === "string") return fits[shape]!(value) ? undefined : `${at} is not ${shape}`;

  // A list and a set are both written as an array. A list holds its items in order, and
  // may hold one twice; a set holds each once, and its order says nothing.
  if ("list" in shape || "set" in shape) {
    const isSet = "set" in shape;
    const inner = (isSet ? shape.set : shape.list) as Shape;
    if (!Array.isArray(value)) return `${at} is not a ${isSet ? "set" : "list"}`;

    const seen = new Set<string>();

    for (const [i, item] of value.entries()) {
      const problem = valueProblem(item, inner, `${at}[${i}]`);
      if (problem) return problem;

      if (isSet) {
        const text = canonical(item);
        if (seen.has(text)) return `${at}[${i}] is already in the set`;
        seen.add(text);
      }
    }

    return undefined;
  }

  if (!isRecord(value)) return `${at} is not a set of fields`;

  for (const [key, inner] of Object.entries(shape)) {
    const problem = valueProblem(value[key], inner, `${at}.${key}`);
    if (problem) return problem;
  }

  return undefined;
}

// A body held against all its types: every key some type's, and each type's
// fields present and of their shape, so a key two types declare must fit both.
export function bodyProblem(body: Values, moulds: Mould[]): string | undefined {
  for (const key of Object.keys(body)) {
    if (!moulds.some((mould) => Object.hasOwn(mould, key))) return `${key} is not a field of its types`;
  }

  for (const mould of moulds) {
    for (const [key, field] of Object.entries(mould)) {
      if (!Object.hasOwn(body, key)) {
        if (!field.optional) return `${key} is missing`;
        continue;
      }

      const problem = valueProblem(body[key], field.shape, key);
      if (problem) return problem;
    }
  }

  return undefined;
}
