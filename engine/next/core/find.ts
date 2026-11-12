// Patterns, the native fast core functions stand upon: find reads its clauses as they
// are written, a fact [e, a, v], a word said, not(…), or(…), or a test, and asks them of
// the index; explain says how. These are the natives that read what they are given as
// written, and are called, never given to another.

import type { Expression, Value } from "../../../language/expression.ts";
import { bindable, isVar, orProblem, solve, usedBeside, type Clause, type Step } from "../patterns/pattern.ts";
import { wordsOf } from "../patterns/words.ts";
import type { Scope } from "./evaluate.ts";
import type { Calling, Structural } from "./natives.ts";
import { keyOf, truly } from "./values.ts";

export function patterns(calling: Calling): Record<string, Structural> {
  const { world, nativeOf, evaluate, apply } = calling;

  function clauseOf(expression: Expression, scope: Scope): Clause {
    const form = expression as Record<string, unknown>;
    const given = (form?.with ?? []) as Expression[];
    const term = (each: Expression) => (isVar(each) ? each : evaluate(each, scope));
    const native = nativeOf(form);

    if (Array.isArray(form?.list) && form.list.length === 3)
      return { fact: (form.list as Expression[]).map(term) as [unknown, unknown, unknown] };

    if (native === "not") return { not: given.map((each) => clauseOf(each, scope)) };

    if (native === "said") {
      if (given.length !== 3) throw new Error("a word said is said(e, a, w): a holon, a key, and a word");

      const terms = given.map(term) as [unknown, unknown, unknown];
      const several = isVar(terms[2]) ? 0 : wordsOf(terms[2]).length;
      if (several > 1) throw new Error(`a word said is one word, and ${JSON.stringify(terms[2])} is ${several}`);

      return { fact: terms, words: true };
    }

    if (native === "or")
      return {
        or: given.map((branch) =>
          nativeOf(branch) === "and"
            ? (((branch as { with?: Expression[] }).with ?? []) as Expression[]).map((each) => clauseOf(each, scope))
            : [clauseOf(branch, scope)],
        ),
      };

    if (Array.isArray(form?.fn)) return { test: evaluate(expression, scope), names: form.fn as string[] };

    throw new Error("a clause is a fact [e, a, v], not(…), or(…), or a test, a lambda of the variables it reads");
  }

  // What a pattern finds: one variable's values, or a record of several, each distinct,
  // for every way its clauses hold.
  function find(given: Expression[], scope: Scope, steps?: Step[]): Value {
    const [spec, ...clauses] = given;
    const shape = isVar(spec)
      ? spec["?"]
      : Object.fromEntries(
          Object.entries(((spec as { record?: Record<string, unknown> })?.record ?? {}) as object).map(([key, each]) => {
            if (!isVar(each)) throw new Error("what a pattern finds is ?x, or a record of them, {x: ?x}");
            return [key, each["?"]];
          }),
        );
    const found = typeof shape === "string" ? [shape] : Object.values(shape);

    const where = clauses.map((each) => clauseOf(each, scope));
    const bound = bindable(where);
    for (const name of found)
      if (!bound.has(name)) throw new Error(`the pattern finds ?${name}, which no fact of it binds`);

    for (const clause of where) {
      const problem =
        "or" in clause ? orProblem(clause.or, new Set([...usedBeside(where, clause), ...found])) : undefined;
      if (problem) throw new Error(problem);
    }

    const bindings = solve(where, world.index(), { test: (fn, values) => truly(apply(fn, values as Value[])) }, steps);

    const seen = new Set<string>();
    const out: Value[] = [];

    for (const binding of bindings) {
      const value: Value =
        typeof shape === "string"
          ? ((binding[shape] as Value) ?? null)
          : Object.fromEntries(Object.entries(shape).map(([key, name]) => [key, (binding[name] as Value) ?? null]));

      if (!seen.has(keyOf(value))) {
        seen.add(keyOf(value));
        out.push(value);
      }
    }

    return out;
  }

  return {
    find: (given, scope) => find(given, scope),

    explain([pattern], scope) {
      if (nativeOf(pattern) !== "find") throw new Error("explain is given a pattern, find(…)");

      const steps: Step[] = [];
      const found = find(((pattern as { with?: Expression[] }).with ?? []) as Expression[], scope, steps);

      return { found: Array.isArray(found) ? found.length : 0, steps: steps as unknown as Value };
    },
  };
}
