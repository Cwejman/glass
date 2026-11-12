// What a value is to the bare language: what is the same, what is true, what comes
// first, what a list and a record are, and a lambda as a value.
//
// Only null and false are false; 0, "" and [] are values like any other. Every native is
// total: given what it cannot use, it gives null or nothing, never fails.

import { canonical } from "../../integrations/glass/canonical.ts";
import { isRef, type Value } from "../../language/expression.ts";

// A lambda as a value: what it gives, and the words around where it was written. Only
// the evaluator makes one, so nothing written as data can pass for one.
export type Closure = { fn: string[]; gives: unknown; scope: unknown };
const closures = new WeakSet<object>();

export function closure(fn: string[], gives: unknown, scope: unknown): Value {
  const made = { fn, gives, scope };
  closures.add(made);
  return made as unknown as Value;
}

export const isClosure = (value: unknown): value is Closure =>
  typeof value === "object" && value !== null && closures.has(value);

export type Rec = { [key: string]: Value };

export const isRecord = (value: unknown): value is Rec =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !isRef(value) && !isClosure(value);

export const truly = (value: unknown) => value !== null && value !== undefined && value !== false;

// A value as a list: a list as it is, nothing as none, anything else as one.
export const list = (value: unknown): Value[] =>
  Array.isArray(value) ? value : value === null || value === undefined ? [] : [value as Value];

// What a value is, said as one string, the same for values that are the same: a holon
// by its id, a lambda by itself, everything else as its canonical text.
const lambdas = new WeakMap<object, string>();
let lambdasSeen = 0;

export function keyOf(value: unknown): string {
  if (isRef(value)) return `@${value.$ref}`;
  if (isClosure(value)) {
    if (!lambdas.has(value)) lambdas.set(value, `λ${lambdasSeen++}`);
    return lambdas.get(value)!;
  }
  if (Array.isArray(value)) return `[${value.map(keyOf).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${keyOf(value[key])}`)
      .join(",")}}`;

  return canonical(value ?? null);
}

export const same = (a: unknown, b: unknown) => keyOf(a) === keyOf(b);

// Which of two values comes first: only values of one kind are ordered.
export function order(a: unknown, b: unknown) {
  const kind = (value: unknown) => (value === null ? "null" : typeof value);
  if (kind(a) !== kind(b) || !["number", "string", "boolean"].includes(kind(a))) return 0;

  return (a as never) < (b as never) ? -1 : (a as never) > (b as never) ? 1 : 0;
}

export function kind(value: unknown) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "list";
  if (isRef(value)) return "holon";
  if (isClosure(value)) return "function";

  return typeof value === "object" ? "record" : typeof value;
}
