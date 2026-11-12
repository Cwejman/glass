// What an expression is: the one form the language takes as data, whether it was typed
// as text, written in a template, or held by a holon. The engine works it out; text.ts
// reads and says it.
//
//   1, "words", true, null              a value, standing for itself
//   { $ref: id }                        a holon, or, if it is a function, the function
//   { call: { $ref: f }, with: [ … ] }  the function f, given what it takes
//   { fn: ["m"], gives: e }             a function written in place, a lambda
//   { var: "m" }                        what a lambda was given, by its word
//   { arg: i }                          what a function of one's own was given, by place
//   { list: [ … ] }, { record: { … } }  a list, or a record, each of its parts worked out
//   { "?": "x" }                        a variable of a pattern, within find

import { isId } from "../integrations/glass/store.ts";

export type Ref = { $ref: string };

export type Expression =
  | null
  | boolean
  | number
  | string
  | Ref
  | { call: Ref; with?: Expression[] }
  | { fn: string[]; gives: Expression }
  | { var: string }
  | { arg: number }
  | { list: Expression[] }
  | { record: Record<string, Expression> }
  | { "?": string };

// What an expression gives: values as JSON has them, and holons by reference.
export type Value = null | boolean | number | string | Ref | Value[] | { [key: string]: Value };

export const isRef = (value: unknown): value is Ref =>
  typeof value === "object" && value !== null && typeof (value as Ref).$ref === "string";

export const ref = ($ref: string): Ref => ({ $ref });

// What is wrong with a value given as an expression, if anything: said in words, so whoever
// gave it can mend it.
const nesting = 32;

export function expressionProblem(value: unknown, nested = 0): string | undefined {
  if (nested >= nesting) return `an expression nests at most ${nesting} deep`;
  if (value === null || typeof value !== "object") return undefined;
  if (Array.isArray(value)) return "a list in an expression is written { list: [ … ] }";

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const only = (...allowed: string[]) => keys.every((key) => allowed.includes(key));
  const inner = (each: unknown) => expressionProblem(each, nested + 1);

  if ("$ref" in record)
    return only("$ref") && isId(record.$ref) ? undefined : "a holon is given as { $ref: id }";

  if ("arg" in record)
    return only("arg") && Number.isInteger(record.arg) && (record.arg as number) >= 0
      ? undefined
      : "an argument is given as { arg: i }, counted from 0";

  if ("?" in record)
    return only("?") && typeof record["?"] === "string"
      ? undefined
      : "a pattern's variable is given as { ?: word }";

  if ("var" in record)
    return only("var") && typeof record.var === "string"
      ? undefined
      : "a lambda's word is given as { var: word }";

  if ("fn" in record) {
    const words = record.fn;
    if (!only("fn", "gives") || !Array.isArray(words) || !words.every((word) => typeof word === "string"))
      return "a lambda is { fn: [words], gives: expression }";

    return inner(record.gives);
  }

  if ("list" in record) {
    if (!only("list") || !Array.isArray(record.list)) return "a list is { list: [ … ] }";
    return record.list.map(inner).find(Boolean);
  }

  if ("record" in record) {
    const fields = record.record;
    if (!only("record") || typeof fields !== "object" || fields === null || Array.isArray(fields))
      return "a record is { record: { … } }";

    return Object.values(fields).map(inner).find(Boolean);
  }

  if (!("call" in record) || !only("call", "with"))
    return "an expression is a value, a holon, a call, a lambda, a list or a record";

  const call = record.call as { $ref?: unknown } | null;
  if (typeof call !== "object" || call === null || Object.keys(call).length !== 1 || !isId(call.$ref))
    return "a call names its function as { $ref: id }";

  if (record.with === undefined) return undefined;
  if (!Array.isArray(record.with)) return "what a call gives is a list";

  return record.with.map(inner).find(Boolean);
}
