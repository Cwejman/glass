// The bare language: how an expression is worked out to a value over a world. It knows
// only the forms an expression takes and how a call finds what to do. A function is a
// holon, an instance of the type named function. It gives in one of two ways: natively,
// by a small act in code its body names, or by an expression of its own, written in the
// field, standing beside the native ones and read as they are.
//
// A native is one of three: given values; lazy, given what it is given unworked, to work
// out only what it needs; or reading what it is given as written, as a pattern is.

import { isRef, type Expression, type Value } from "../../language/expression.ts";
import type { World } from "../world.ts";
import { closure, isClosure, isRecord, truly, type Rec } from "./values.ts";
import { natives, type Calling, type Deferred } from "./natives.ts";

// What a lambda closes over: the words around it, and a function of one's own's places.
export type Scope = { words: Record<string, Value>; up?: Scope; args?: Value[] };

const deepest = 4000;

// One evaluator for each world: it is pure over its world, so what it learns once, which
// types are functions and what a holon says, holds for every read of that world.
const made = new WeakMap<World, ReturnType<typeof evaluating>>();

export function evaluator(world: World) {
  if (!made.has(world)) made.set(world, evaluating(world));
  return made.get(world)!;
}

function evaluating(world: World) {
  let depth = 0;

  const functionTypes = new Set(
    [...world.known.values()]
      .filter(({ holon }) => holon.name === "function" && holon.mould)
      .map(({ holon }) => holon.id),
  );

  // What a call finds: a native by the name its body gives, or an expression it gives.
  function functionOf(id: string) {
    const holon = world.known.get(id)?.holon;
    if (!holon) throw new Error(`the function ${id} is not in the field`);

    const body = holon.body as { native?: unknown; gives?: Expression };
    const isFunction = holon.instance.some((type) => functionTypes.has(type));
    const native = isFunction && typeof body.native === "string" ? body.native : undefined;

    return { name: holon.name ?? id, native, gives: body.gives };
  }

  const calling: Calling = {
    world,
    apply,
    evaluate: (expression, scope) => evaluate(expression, scope),
    nativeOf: (expression) => {
      const id = (expression as { call?: { $ref?: string } } | null)?.call?.$ref;
      return id && world.known.has(id) ? functionOf(id).native : undefined;
    },
  };

  const { given, lazy, structural } = natives(calling);

  // A function, as a value or a holon, given values.
  function apply(fn: unknown, values: Value[]): Value {
    if (isClosure(fn)) {
      const words = Object.fromEntries(fn.fn.map((word, i) => [word, values[i] ?? null]));
      return evaluate(fn.gives as Expression, { words, up: fn.scope as Scope });
    }

    return isRef(fn) && world.known.has(fn.$ref) ? called(fn.$ref, values) : null;
  }

  // A function kept as a holon, given values already worked out.
  function called(id: string, values: Value[]): Value {
    const { name, native, gives } = functionOf(id);

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

  function evaluate(expression: Expression, scope: Scope = { words: {} }): Value {
    if (++depth > deepest) throw new Error(`an expression nests at most ${deepest} deep`);

    try {
      return form(expression, scope);
    } finally {
      depth--;
    }
  }

  function form(expression: Expression, scope: Scope): Value {
    if (expression === null || typeof expression !== "object") return expression ?? null;
    if (Array.isArray(expression)) throw new Error("a list is written { list: [ … ] }");

    if ("$ref" in expression) return { $ref: expression.$ref };
    if ("var" in expression) return wordIn(scope, expression.var);
    if ("arg" in expression) return argumentIn(scope, expression.arg);
    if ("fn" in expression) return closure(expression.fn, expression.gives, scope);
    if ("?" in expression)
      throw new Error(`?${expression["?"]} is a pattern's variable, and stands only within find`);
    if ("list" in expression) return expression.list.map((each) => evaluate(each, scope));
    if ("record" in expression)
      return Object.fromEntries(
        Object.entries(expression.record).map(([key, each]) => [key, evaluate(each, scope)]),
      );

    if ("call" in expression) {
      const id = expression.call.$ref;
      const { native } = functionOf(id);
      const written = expression.with ?? [];

      if (native && structural[native]) return structural[native]!(written, scope);
      if (native && lazy[native]) return lazy[native]!(written.map((each) => deferred(each, scope)));

      return called(
        id,
        written.map((each) => evaluate(each, scope)),
      );
    }

    throw new Error(`not an expression: ${JSON.stringify(expression).slice(0, 80)}`);
  }

  // What a lazy native is given for an expression: worked out when asked, and a record's
  // one field alone when a case asks for it.
  function deferred(expression: Expression, scope: Scope): Deferred {
    const record = (expression as { record?: Record<string, Expression> } | null)?.record;
    return Object.assign(() => evaluate(expression, scope), {
      key: (key: string) => (record && key in record ? evaluate(record[key]!, scope) : undefined),
    });
  }

  return { evaluate: (expression: Expression) => evaluate(expression), apply, truly };
}

// What a lazy native is given for a value already worked out.
function valued(value: Value): Deferred {
  return Object.assign(() => value, {
    key: (key: string) => (isRecord(value) ? (value as Rec)[key] : undefined),
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
