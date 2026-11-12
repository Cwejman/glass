// A read is an expression, and its answer a value. There are two ways to answer it.
// A holon, or a whole with what it holds, named by its id, is read by identity: a few
// blocks, nothing else of the field. Anything else is worked out over the world, every
// attached store read whole, once for the field; where it lacks a store's history, the
// history is read and the expression worked out again.
//
// A read, in order: answer (here) chooses; byIdentity reads blocks through the field;
// overWorld asks the world (world.ts) of the evaluator (evaluate.ts), whose natives
// (natives/) read the world and, for patterns, its index (patterns/).

import { expressionProblem, isRef, type Expression, type Value } from "../../language/expression.ts";
import { evaluator } from "./evaluate.ts";
import { isClosure } from "./values.ts";
import { keptIn, readHolon, readWhole, type Field } from "../field.ts";
import { isLack } from "./world.ts";

export async function answer(field: Field, expression: Expression): Promise<Value> {
  const problem = expressionProblem(expression);
  if (problem) throw new Error(problem);

  return (await byIdentity(field, expression)) ?? overWorld(field, expression);
}

// ---- Over the world

async function overWorld(field: Field, expression: Expression): Promise<Value> {
  const world = await field.world();

  for (;;) {
    try {
      return outward(evaluator(world).evaluate(expression));
    } catch (thrown) {
      if (!isLack(thrown)) throw thrown;
      await field.logOf(thrown.lacks.log);
    }
  }
}

// A value as it leaves the engine: a lambda as the words it takes.
function outward(value: Value): Value {
  if (isClosure(value)) return { function: value.fn.join(", ") };
  if (Array.isArray(value)) return value.map(outward);
  if (typeof value === "object" && value !== null && !isRef(value))
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, outward(inner)]));

  return value;
}

// ---- By identity

// holon(@id) or whole(@id, depth, stop), answered from blocks, if that is what was asked.
async function byIdentity(field: Field, expression: Expression): Promise<Value | undefined> {
  if (typeof expression !== "object" || expression === null || !("call" in expression)) return undefined;

  const [first, depth, stop] = expression.with ?? [];
  if (!isRef(first) || (depth !== undefined && typeof depth !== "number")) return undefined;

  const native = await nativeIn(field, expression.call.$ref);
  if (native === "holon") {
    const read = await readHolon(field, first.$ref);
    return read as Value;
  }

  const stopAt = stop === undefined ? [] : asStrings(stop);
  if (native === "whole" && stopAt) {
    const whole = await readWhole(field, first.$ref, stopAt, depth ?? Number.POSITIVE_INFINITY);
    return whole as unknown as Value;
  }

  return undefined;
}

const asStrings = (value: Expression) =>
  typeof value === "object" &&
  value !== null &&
  "list" in value &&
  value.list.every((each) => typeof each === "string")
    ? (value.list as string[])
    : undefined;

// The native a function holon names, if it is one.
async function nativeIn(field: Field, id: string) {
  const fn = await keptIn(field, id);
  const native = (fn?.holon.body as { native?: unknown } | undefined)?.native;
  if (typeof native !== "string") return undefined;

  const types = await Promise.all(fn!.holon.instance.map((type) => keptIn(field, type)));
  return types.some((type) => type?.holon.name === "function" && type.holon.mould) ? native : undefined;
}
