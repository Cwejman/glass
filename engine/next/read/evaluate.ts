// How a read is worked out: an expression, over the field as the stores stood when the
// read began. The language is the same as ever; what is new is that the field is not
// held here. Every holon is asked of the stores as it is needed (field.ts), so working
// an expression out waits on them, and is asynchronous throughout.
//
// A function is a holon, an instance of the type named function. It gives in one of two
// ways: natively, by a small act in code its body names, or by an expression of its own,
// written in the field. A native is one of three: given values; lazy, given what it is
// given unworked, to work out only what it needs; or reading what it is given as
// written, as a pattern is.

import { expressionProblem, isRef, type Expression, type Value } from "../../../language/expression.ts";
import type { Heads } from "../engine.ts";
import { fieldOf, type Field, type Stores } from "./field.ts";
import { natives, type Calling, type Deferred } from "./natives/natives.ts";
import { closure, isClosure, isRecord, type Rec } from "./values.ts";

// What a lambda closes over: the words around it, and a function of one's own's places.
export type Scope = { words: Record<string, Value>; up?: Scope; args?: Value[] };

// The most steps one read may take, so a function that never ends is stopped.
const most = 10_000_000;

// Works an expression out over the stores, each at its head. Gives its value, or the
// problem that stopped it, and either way the stores it asked and the holons it found
// kept differently in two stores, where there were any.
export async function evaluate(
  expression: Expression,
  stores: Stores,
  heads: Heads,
): Promise<({ value: Value } | { problem: string }) & { asked: string[]; diverged?: string[] }> {
  const field = fieldOf(stores, heads);
  const seen = () => ({
    asked: [...field.asked],
    ...(field.diverged.size && { diverged: [...field.diverged].sort() }),
  });

  try {
    const problem = expressionProblem(expression);
    if (problem) throw new Error(problem);
    return { value: outward(await evaluator(field).evaluate(expression)), ...seen() };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error), ...seen() };
  }
}

type Function = { name: string; native?: string; gives?: Expression };

export function evaluator(field: Field) {
  let steps = 0;
  const functions = new Map<string, Promise<Function>>();

  // What a call finds: a native by the name its body gives, or an expression it gives.
  function functionOf(id: string) {
    if (!functions.has(id)) functions.set(id, found(id));
    return functions.get(id)!;
  }

  async function found(id: string): Promise<Function> {
    const kept = await field.holon(id);
    if (!kept) throw new Error(`the function ${id} is not in the field`);

    const { holon } = kept;
    const types = await Promise.all(holon.instance.map((type) => field.holon(type)));
    const isFunction = types.some((type) => type?.holon.name === "function" && type.holon.mould);
    const body = holon.body as { native?: unknown; gives?: Expression };
    const native = isFunction && typeof body.native === "string" ? body.native : undefined;

    return { name: holon.name ?? id, native, gives: body.gives };
  }

  const calling: Calling = {
    field,
    apply,
    evaluate: (expression, scope) => evaluate(expression, scope),
    nativeOf: async (expression) => {
      const id = (expression as { call?: { $ref?: string } } | null)?.call?.$ref;
      return id && (await field.holon(id)) ? (await functionOf(id)).native : undefined;
    },
  };

  const { given, lazy, structural } = natives(calling);

  // A function, as a value or a holon, given values.
  async function apply(fn: unknown, values: Value[]): Promise<Value> {
    if (isClosure(fn)) {
      const words = Object.fromEntries(fn.fn.map((word, i) => [word, values[i] ?? null]));
      return evaluate(fn.gives as Expression, { words, up: fn.scope as Scope });
    }

    return isRef(fn) && (await field.holon(fn.$ref)) ? called(fn.$ref, values) : null;
  }

  // A function kept as a holon, given values already worked out.
  async function called(id: string, values: Value[]): Promise<Value> {
    const { name, native, gives } = await functionOf(id);

    if (native && given[native]) return given[native]!(values);
    if (native && lazy[native]) return lazy[native]!(values.map(valued));
    if (native && structural[native])
      throw new Error(`${name} reads what it is given as written, so it is called, not given to another`);

    if (gives === undefined) throw new Error(`${name} is not a function`);

    const written = gives as { fn?: string[]; gives?: Expression };
    return Array.isArray(written?.fn)
      ? apply(closure(written.fn, written.gives, { words: {} }), values)
      : evaluate(gives, { words: {}, args: values });
  }

  function evaluate(expression: Expression, scope: Scope = { words: {} }): Promise<Value> {
    if (++steps > most) throw new Error(`a read takes at most ${most.toLocaleString("en")} steps`);
    return form(expression, scope);
  }

  async function form(expression: Expression, scope: Scope): Promise<Value> {
    if (expression === null || typeof expression !== "object") return expression ?? null;
    if (Array.isArray(expression)) throw new Error("a list is written { list: [ … ] }");

    if ("$ref" in expression) return { $ref: expression.$ref };
    if ("var" in expression) return wordIn(scope, expression.var);
    if ("arg" in expression) return argumentIn(scope, expression.arg);
    if ("fn" in expression) return closure(expression.fn, expression.gives, scope);
    if ("?" in expression)
      throw new Error(`?${expression["?"]} is a pattern's variable, and stands only within find`);
    if ("list" in expression) return Promise.all(expression.list.map((each) => evaluate(each, scope)));
    if ("record" in expression) {
      const entries = Object.entries(expression.record);
      const values = await Promise.all(entries.map(([, each]) => evaluate(each, scope)));
      return Object.fromEntries(entries.map(([key], i) => [key, values[i]!]));
    }

    if ("call" in expression) {
      const id = expression.call.$ref;
      const { native } = await functionOf(id);
      const written = expression.with ?? [];

      if (native && structural[native]) return structural[native]!(written, scope);
      if (native && lazy[native]) return lazy[native]!(written.map((each) => deferred(each, scope)));

      return called(id, await Promise.all(written.map((each) => evaluate(each, scope))));
    }

    throw new Error(`not an expression: ${JSON.stringify(expression).slice(0, 80)}`);
  }

  // What a lazy native is given for an expression: worked out when asked, and a record's
  // one field alone when a case asks for it.
  function deferred(expression: Expression, scope: Scope): Deferred {
    const record = (expression as { record?: Record<string, Expression> } | null)?.record;
    return Object.assign(() => evaluate(expression, scope), {
      key: async (key: string) => (record && key in record ? evaluate(record[key]!, scope) : undefined),
    });
  }

  return { evaluate: (expression: Expression) => evaluate(expression), apply };
}

// What a lazy native is given for a value already worked out.
function valued(value: Value): Deferred {
  return Object.assign(async () => value, {
    key: async (key: string) => (isRecord(value) ? (value as Rec)[key] : undefined),
  });
}

function wordIn(scope: Scope | undefined, word: string): Value {
  for (let at = scope; at; at = at.up) if (word in at.words) return at.words[word]!;
  throw new Error(`${word} is not a word any lambda around it takes`);
}

function argumentIn(scope: Scope | undefined, place: number): Value {
  for (let at = scope; at; at = at.up) if (at.args) return at.args[place] ?? null;
  throw new Error("an argument is given only within a function of one's own");
}

// A value as it leaves the engine: a lambda as the words it takes.
function outward(value: Value): Value {
  if (isClosure(value)) return { function: value.fn.join(", ") };
  if (Array.isArray(value)) return value.map(outward);
  if (typeof value === "object" && value !== null && !isRef(value))
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, outward(inner)]));

  return value;
}
