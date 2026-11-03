import type { Json } from "../store/canonical.ts";
import type { Body } from "../store/objects.ts";
import { first, firstOf, type Problem } from "./problem.ts";
import { isRef } from "./references.ts";

// A type is a holon whose body declares fields. Each field is said in prose,
// what the key means, beside the shape the engine checks: the fields are where
// holons connect, the field's connectors, so each carries both.
//
// This file says what a connector is, what is wrong with a type's own
// connectors, and what is wrong with a body held against its types.

export type Shape =
  | "string"
  | "markdown"
  | "number"
  | "boolean"
  | "ref"
  | "json"
  | { list: Shape }
  | { fields: Connectors };

export interface Connector {
  says: string;
  shape: Shape;
  optional?: boolean;
}

export type Connectors = { [key: string]: Connector };

// A body is a type's when it declares fields.
export const isType = (body: Body) => body.fields !== undefined;

export const connectorsOf = (body: Body) => body.fields as unknown as Connectors;

export function typeProblem(body: Body): Problem {
  if (!isType(body)) return undefined;
  const problem = connectorsProblem(body.fields!, "fields");
  return problem && `a type's ${problem}`;
}

// What is wrong with a body held against the connectors of all its types:
// every key declared by some type, and each type held against the body on
// its own, so a key two types declare must fit both.
export function bodyProblem(body: Body, types: Connectors[]): Problem {
  const undeclared = Object.keys(body).find(
    (key) => !types.some((connectors) => Object.hasOwn(connectors, key)),
  );
  if (undeclared) return `${undeclared} is not a field of its types`;

  return firstOf(types, (connectors) => valuesProblem(body, connectors, "", { closed: false }));
}

// A type's own connectors: each said in prose, and each of a shape there is.

const shapes = ["string", "markdown", "number", "boolean", "ref", "json"];

function connectorsProblem(connectors: Json, at: string): Problem {
  if (!isMap(connectors)) return `${at} are not a map of fields`;

  return firstOf(Object.entries(connectors), ([key, connector]) => {
    const here = `${at}.${key}`;
    if (!isMap(connector)) return `${here} is not a field`;

    return first(
      () => (isSaid(connector.says) ? undefined : `${here} says nothing in prose`),
      () =>
        connector.optional === undefined || typeof connector.optional === "boolean"
          ? undefined
          : `${here}.optional is not a boolean`,
      () => shapeProblem(connector.shape, here),
    );
  });
}

function shapeProblem(shape: Json | undefined, at: string): Problem {
  if (typeof shape === "string") return shapes.includes(shape) ? undefined : `${at} has no shape ${shape}`;
  if (isMap(shape) && Object.keys(shape).length === 1) {
    if ("list" in shape) return shapeProblem(shape.list, `${at}[]`);
    if ("fields" in shape) return connectorsProblem(shape.fields!, at);
  }
  return `${at} has no shape`;
}

// Values held against connectors: each value of its shape, every connector
// that is not optional present, and, where the connectors are all there is,
// no key they do not declare.

function valuesProblem(
  values: { [key: string]: Json },
  connectors: Connectors,
  at: string,
  { closed = true } = {},
): Problem {
  const valueAt = ([key, value]: [string, Json]): Problem => {
    if (Object.hasOwn(connectors, key)) return valueProblem(value, connectors[key]!.shape, `${at}${key}`);
    return closed ? `${at}${key} is not a field of its types` : undefined;
  };
  const presentAt = ([key, connector]: [string, Connector]): Problem =>
    connector.optional || Object.hasOwn(values, key) ? undefined : `${at}${key} is missing`;

  return first(
    () => firstOf(Object.entries(values), valueAt),
    () => firstOf(Object.entries(connectors), presentAt),
  );
}

const fits: Record<string, (value: Json) => boolean> = {
  string: (value) => typeof value === "string",
  markdown: (value) => typeof value === "string",
  number: (value) => typeof value === "number",
  boolean: (value) => typeof value === "boolean",
  ref: isRef,
  json: () => true,
};

function valueProblem(value: Json, shape: Shape, at: string): Problem {
  if (typeof shape === "string") return fits[shape]!(value) ? undefined : `${at} is not ${shape}`;

  if ("list" in shape) {
    if (!Array.isArray(value)) return `${at} is not a list`;
    return firstOf(value.entries(), ([i, item]) => valueProblem(item, shape.list, `${at}[${i}]`));
  }

  if (!isMap(value)) return `${at} is not a set of fields`;
  return valuesProblem(value, shape.fields, `${at}.`);
}

const isMap = (value: Json | undefined): value is { [key: string]: Json } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isSaid = (says: Json | undefined) => typeof says === "string" && says.trim() !== "";
