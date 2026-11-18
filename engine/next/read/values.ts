// What a value is to the bare language: what is the same, what is true, what comes
// first, what a list and a record are, and a lambda as a value.
//
// Only null and false are false; 0, "" and [] are values like any other. Every native is
// total: given what it cannot use, it gives null or nothing, never fails.

import { canonical } from "../../../integrations/glass/canonical.ts";

// What a read gives: values as JSON has them, and holons by reference.
export type Ref = { $ref: string };
export type Value = null | boolean | number | string | Ref | Value[] | { [key: string]: Value };

export const isRef = (value: unknown): value is Ref =>
  typeof value === "object" && value !== null && typeof (value as Ref).$ref === "string";

export const ref = ($ref: string): Ref => ({ $ref });

// A lambda as a value: a function held where it was written, by its id, and the frame
// it was written in. Only the evaluator makes one, so nothing written as data can pass
// for one.
export type Closure = { fn: string; frame: unknown };
const closures = new WeakSet<object>();

export function closure(fn: string, frame: unknown): Value {
  const made = { fn, frame };
  closures.add(made);
  return made as unknown as Value;
}

export const isClosure = (value: unknown): value is Closure =>
  typeof value === "object" && value !== null && closures.has(value);

// A drawing: a component applied, what the use gave it bound to the component's input,
// and where it stands, the uses walked through component bodies from the root down to
// the one that applied it. A use naming no function is drawn too, its component null,
// for what draws it to find one by type. Only the evaluator makes one, as it does a
// lambda, so nothing written as data can pass for one; as it leaves the engine it is
// the record it holds.
export type Drawing = { $draw: Ref | null; given: Value[]; at: string[] };
const drawings = new WeakSet<object>();

export function drawing($draw: Ref | null, given: Value[], at: readonly string[]): Value {
  const made = { $draw, given, at: [...at] };
  drawings.add(made);
  return made as unknown as Value;
}

export const isDrawing = (value: unknown): value is Drawing =>
  typeof value === "object" && value !== null && drawings.has(value);

export type Rec = { [key: string]: Value };

export const isRecord = (value: unknown): value is Rec =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !isRef(value) &&
  !isClosure(value) &&
  !isDrawing(value);

export const truly = (value: unknown) => value !== null && value !== undefined && value !== false;

// A value as a list: a list as it is, nothing as none, anything else as one.
export const list = (value: unknown): Value[] =>
  Array.isArray(value) ? value : value === null || value === undefined ? [] : [value as Value];

// What a value is, said as one string, the same for values that are the same: a holon
// by its id, a lambda by itself, a drawing by what it draws, everything else as its
// canonical text.
const lambdas = new WeakMap<object, string>();
let lambdasSeen = 0;

export function keyOf(value: unknown): string {
  if (isRef(value)) return `@${value.$ref}`;
  if (isClosure(value)) {
    if (!lambdas.has(value)) lambdas.set(value, `λ${lambdasSeen++}`);
    return lambdas.get(value)!;
  }
  if (isDrawing(value))
    return `draw(${keyOf(value.$draw)},${keyOf(value.given)},${JSON.stringify(value.at)})`;
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
  if (isDrawing(value)) return "drawing";

  return typeof value === "object" ? "record" : typeof value;
}
