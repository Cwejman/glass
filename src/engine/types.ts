import type { Json } from "../store/canonical.ts";
import type { Body } from "../store/objects.ts";
import { isRef } from "./references.ts";

// A type is a holon whose body declares fields. Each field is said in prose,
// what the key means, beside the shape the engine checks: the fields are where
// holons connect, so each connector carries both.

export type Shape =
  | "string"
  | "markdown"
  | "number"
  | "boolean"
  | "ref"
  | "json"
  | { list: Shape }
  | { fields: Fields };

export interface Field {
  says: string;
  shape: Shape;
  optional?: boolean;
}

export type Fields = { [key: string]: Field };

export function fieldsOf(body: Body): Fields | undefined {
  const fields = body.fields;
  if (fields === undefined) return undefined;
  const problem = fieldsProblem(fields, "fields");
  if (problem) throw new Error(`a type's ${problem}`);
  return fields as unknown as Fields;
}

function fieldsProblem(fields: Json, at: string): string | undefined {
  if (typeof fields !== "object" || fields === null || Array.isArray(fields)) return `${at} are not a map of fields`;
  for (const [key, field] of Object.entries(fields)) {
    if (typeof field !== "object" || field === null || Array.isArray(field)) return `${at}.${key} is not a field`;
    if (typeof field.says !== "string" || field.says.trim() === "") return `${at}.${key} says nothing in prose`;
    if (field.optional !== undefined && typeof field.optional !== "boolean") return `${at}.${key}.optional is not a boolean`;
    const problem = shapeProblem(field.shape, `${at}.${key}`);
    if (problem) return problem;
  }
  return undefined;
}

function shapeProblem(shape: Json | undefined, at: string): string | undefined {
  if (typeof shape === "string")
    return ["string", "markdown", "number", "boolean", "ref", "json"].includes(shape) ? undefined : `${at} has no shape ${shape}`;
  if (typeof shape === "object" && shape !== null && !Array.isArray(shape)) {
    if ("list" in shape && Object.keys(shape).length === 1) return shapeProblem(shape.list, `${at}[]`);
    if ("fields" in shape && Object.keys(shape).length === 1) return fieldsProblem(shape.fields!, at);
  }
  return `${at} has no shape`;
}

// What is wrong with a body held against the fields of all its types, if
// anything: every required field present, every key declared by some type,
// every value of its shape.
export function bodyProblem(body: Body, types: Fields[]): string | undefined {
  return valuesProblem(body, Object.assign({}, ...types), "");
}

function valuesProblem(values: { [key: string]: Json }, fields: Fields, at: string): string | undefined {
  for (const [key, value] of Object.entries(values)) {
    const field = fields[key];
    if (!field) return `${at}${key} is not a field of its types`;
    const problem = valueProblem(value, field.shape, `${at}${key}`);
    if (problem) return problem;
  }
  for (const [key, field] of Object.entries(fields))
    if (!field.optional && values[key] === undefined) return `${at}${key} is missing`;
  return undefined;
}

function valueProblem(value: Json, shape: Shape, at: string): string | undefined {
  const wrong = `${at} is not ${typeof shape === "string" ? shape : "list" in shape ? "a list" : "a set of fields"}`;
  switch (shape) {
    case "string":
    case "markdown":
      return typeof value === "string" ? undefined : wrong;
    case "number":
      return typeof value === "number" ? undefined : wrong;
    case "boolean":
      return typeof value === "boolean" ? undefined : wrong;
    case "ref":
      return isRef(value) ? undefined : wrong;
    case "json":
      return undefined;
  }
  if ("list" in shape) {
    if (!Array.isArray(value)) return wrong;
    for (const [i, item] of value.entries()) {
      const problem = valueProblem(item, shape.list, `${at}[${i}]`);
      if (problem) return problem;
    }
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return wrong;
  return valuesProblem(value, shape.fields, `${at}.`);
}
