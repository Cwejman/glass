// Patterns, the native fast core functions stand upon: find reads its clauses as they
// are written, a fact [e, a, v], a word said, not(…), or(…), or a test, and asks them of
// the stores; explain says how. These are the natives that read what they are given as
// written, and are called, never given to another.

import type { Value } from "../../../../language/expression.ts";
import { bindable, isVar, orProblem, solve, usedBeside, type Clause, type Step } from "../patterns.ts";
import { wordsOf } from "../words.ts";
import type { Maybe } from "../maybe.ts";
import type { Calling, Structural, Written } from "./natives.ts";
import { keyOf, truly } from "../values.ts";

// A test, held to the values of the variables it reads.
type Holds = (values: Value[]) => Maybe<Value>;

export function patterns({ field }: Calling): Record<string, Structural> {
  async function clauseOf(given: unknown, written: Written): Promise<Clause> {
    const term = async (each: unknown) => (isVar(each) ? each : written.value(each));

    const fact = written.fact(given);
    if (fact) return { fact: (await Promise.all(fact.map(term))) as [unknown, unknown, unknown] };

    const call = await written.called(given);
    const within = call?.given ?? [];

    if (call?.native === "not")
      return { not: await Promise.all(within.map((each) => clauseOf(each, written))) };

    if (call?.native === "said") {
      if (within.length !== 3) throw new Error("a word said is said(e, a, w): a holon, a key, and a word");

      const terms = (await Promise.all(within.map(term))) as [unknown, unknown, unknown];
      const several = isVar(terms[2]) ? 0 : wordsOf(terms[2]).length;
      if (several > 1)
        throw new Error(`a word said is one word, and ${JSON.stringify(terms[2])} is ${several}`);

      return { fact: terms, words: true };
    }

    if (call?.native === "or")
      return {
        or: await Promise.all(
          within.map(async (branch) => {
            const and = await written.called(branch);
            return and?.native === "and"
              ? Promise.all(and.given.map((each) => clauseOf(each, written)))
              : [await clauseOf(branch, written)];
          }),
        ),
      };

    const test = await written.test(given);
    if (test) return { test: test.holds, names: test.names };

    throw new Error(
      "a clause is a fact [e, a, v], not(…), or(…), or a test, a use or lambda reading the pattern's variables",
    );
  }

  // What a pattern finds: one variable's values, or a record of several, each distinct,
  // for every way its clauses hold.
  async function find(given: unknown[], written: Written, steps?: Step[]): Promise<Value> {
    const [spec, ...clauses] = given;
    const shape = isVar(spec)
      ? spec["?"]
      : Object.fromEntries(
          Object.entries(written.fields(spec) ?? {}).map(([key, each]) => {
            if (!isVar(each)) throw new Error("what a pattern finds is ?x, or a record of them, {x: ?x}");
            return [key, each["?"]];
          }),
        );
    const found = typeof shape === "string" ? [shape] : Object.values(shape);

    const where = await Promise.all(clauses.map((each) => clauseOf(each, written)));
    const bound = bindable(where);
    for (const name of found)
      if (!bound.has(name)) throw new Error(`the pattern finds ?${name}, which no fact of it binds`);

    for (const clause of where) {
      const problem =
        "or" in clause ? orProblem(clause.or, new Set([...usedBeside(where, clause), ...found])) : undefined;
      if (problem) throw new Error(problem);
    }

    const bindings = await solve(
      where,
      field,
      { test: async (holds, values) => truly(await (holds as Holds)(values as Value[])) },
      steps,
    );

    const seen = new Set<string>();
    const out: Value[] = [];

    for (const binding of bindings) {
      const value: Value =
        typeof shape === "string"
          ? ((binding[shape] as Value) ?? null)
          : Object.fromEntries(
              Object.entries(shape).map(([key, name]) => [key, (binding[name] as Value) ?? null]),
            );

      if (!seen.has(keyOf(value))) {
        seen.add(keyOf(value));
        out.push(value);
      }
    }

    return out;
  }

  return {
    find: (given, written) => find(given, written),

    async explain([pattern], written) {
      const call = await written.called(pattern);
      if (call?.native !== "find") throw new Error("explain is given a pattern, find(…)");

      const steps: Step[] = [];
      const found = await find(call.given, written, steps);

      return { found: Array.isArray(found) ? found.length : 0, steps: steps as unknown as Value };
    },
  };
}
