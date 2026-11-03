import type { Json } from "../store/canonical.ts";
import { isId, type Id } from "../store/id.ts";
import { isRecord } from "../store/objects.ts";
import type { Field } from "./field.ts";
import { references } from "./references.ts";
import { isType } from "./types.ts";

// An expression is data: a value that says what to gather from the field,
// held in a body like any other value, so a layout can gather as easily as
// it can point. Evaluated against the field, it gives the holons it gathers,
// in the order the field holds them. Each form names one way of looking:
//
//   { "instances": T }    the instances of the type T
//   { "types": true }     every type
//   { "pointing": H }     what points at the holon H
//   { "named": true }     every holon a store gives a name
//   { "all": [ … ] }      what every expression in the list gathers
//   { "any": [ … ] }      what any expression in the list gathers
//
// A holon is given by its id or by a reference to it, `{ "$ref": id }`, so
// an expression in a body points into the field as plainly as any value.

export type Expression =
  | { instances: Given }
  | { types: true }
  | { pointing: Given }
  | { named: true }
  | { all: Expression[] }
  | { any: Expression[] };

type Given = Id | { $ref: Id };

const idOf = (given: Given) => (typeof given === "string" ? given : given.$ref);

export function gather(field: Field, expression: Expression): Id[] {
  const held = [...field.known.values()].map(({ version }) => version);

  if ("instances" in expression) {
    const type = idOf(expression.instances);
    return held.filter(({ instance }) => instance.includes(type)).map(({ id }) => id);
  }
  if ("types" in expression) return held.filter(({ body }) => isType(body)).map(({ id }) => id);
  if ("pointing" in expression) {
    const target = idOf(expression.pointing);
    return held.filter(({ body }) => references(body).some(({ id }) => id === target)).map(({ id }) => id);
  }
  if ("named" in expression) {
    const named = new Set(field.stores.flatMap(({ names }) => Object.values(names)));
    return held.filter(({ id }) => named.has(id)).map(({ id }) => id);
  }

  const parts = ("all" in expression ? expression.all : expression.any).map(
    (inner) => new Set(gather(field, inner)),
  );
  const kept = (id: Id) =>
    "all" in expression ? parts.every((part) => part.has(id)) : parts.some((part) => part.has(id));
  return held.map(({ id }) => id).filter(kept);
}

// What is wrong with a value meant as an expression, if anything.
export function expressionProblem(value: Json | undefined): string | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 1)
    return "an expression is one form, as { instances: … }";
  const [form, given] = Object.entries(value)[0]!;

  switch (form) {
    case "instances":
    case "pointing":
      return isGiven(given) ? undefined : `${form} names a holon, by its id or a reference to it`;
    case "types":
    case "named":
      return given === true ? undefined : `${form} is written ${form}: true`;
    case "all":
    case "any":
      if (!Array.isArray(given) || given.length === 0) return `${form} holds a list of expressions`;
      return given.map((inner) => expressionProblem(inner as Json)).find(Boolean);
    default:
      return `there is no expression ${form}`;
  }
}

const isGiven = (value: unknown): value is Given =>
  isId(value) || (isRecord(value) && Object.keys(value).length === 1 && isId(value.$ref));
