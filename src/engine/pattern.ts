// A pattern: what must hold, said as clauses over facts, its variables shared between
// them as the links. It says what, not how, so how it is answered is planned: each step
// taken when it is cheapest for what is bound so far, asked of the stores, and joined
// by the variables it shares with what came before.
//
// A clause is one of four:
//   a fact      [e, a, v], any of the three a variable, the rest values
//   not         clauses that must not hold for the bindings made, its own variables free
//   or          branches of clauses, any of which may hold, each binding the same variables
//   a test      a function given the values of the variables its words name, kept if true
//
// What it gives is every way the clauses hold, each a binding of its variables; what of
// those is found, and in what shape, the one asking says.

import type { Answering, Asked, Fact, FactValue } from "./facts.ts";
import { valueKey } from "./facts.ts";
import { isRef } from "./references.ts";

export type Var = { "?": string };
export type Clause =
  | { fact: [unknown, unknown, unknown] }
  | { not: Clause[] }
  | { or: Clause[][] }
  | { test: unknown; names: string[] };

export type Binding = Record<string, FactValue>;

// What the kernel gives a pattern: a test held to the values it names.
export type Working = { test(fn: unknown, given: FactValue[]): boolean };

// How each step was answered, so a plan can be said.
export type Step = { step: string; served: string; facts: number; bindings: number };

export const isVar = (term: unknown): term is Var =>
  typeof term === "object" && term !== null && typeof (term as Var)["?"] === "string";

// The variables a clause binds: a fact's, and those every branch of an or binds.
function bindsOf(clause: Clause): Set<string> {
  if ("fact" in clause) return varsOf(clause);
  if ("or" in clause)
    return new Set(clause.or.flatMap((branch) => branch.flatMap((inner) => [...bindsOf(inner)])));

  return new Set();
}

// The variables something in these clauses can bind.
export const bindable = (where: Clause[]) => new Set(where.flatMap((clause) => [...bindsOf(clause)]));

// The variables a clause binds or reads.
function varsOf(clause: Clause, into = new Set<string>()): Set<string> {
  if ("fact" in clause) clause.fact.forEach((term) => isVar(term) && into.add(term["?"]));
  else if ("not" in clause) clause.not.forEach((inner) => varsOf(inner, into));
  else if ("or" in clause) clause.or.flat().forEach((inner) => varsOf(inner, into));
  else clause.names.forEach((name) => into.add(name));

  return into;
}

const said = (clause: Clause): string => {
  if ("fact" in clause)
    return `[${clause.fact.map((term) => (isVar(term) ? `?${term["?"]}` : isRef(term) ? `@${term.$ref}` : JSON.stringify(term))).join(", ")}]`;
  if ("not" in clause) return `not(${clause.not.map(said).join(", ")})`;
  if ("or" in clause) return `or(${clause.or.map((branch) => branch.map(said).join(" and ")).join(", ")})`;

  return `test(${clause.names.join(", ")})`;
};

// What a fact asks, given one binding: its values, and its variables where bound.
function askedOf([e, a, v]: [unknown, unknown, unknown], binding: Binding): Asked {
  const value = (term: unknown) => (isVar(term) ? binding[term["?"]] : term);
  const [held, key, valued] = [value(e), value(a), value(v)];

  // A holon's place known as what is not a holon, or a key as what is not a key, matches nothing.
  if ((held !== undefined && !isRef(held)) || (key !== undefined && typeof key !== "string"))
    return { nothing: true };

  return {
    ...(isRef(held) ? { e: held.$ref } : {}),
    ...(typeof key === "string" ? { a: key } : {}),
    ...(valued !== undefined ? { v: valued as FactValue } : {}),
  };
}

// A binding made larger by one fact, or nothing where the fact disagrees with it.
function bindFact(terms: unknown[], fact: Fact, binding: Binding): Binding | undefined {
  const made = { ...binding };
  const places: FactValue[] = [{ $ref: fact.e }, fact.a, fact.v];

  for (const [i, term] of terms.entries()) {
    if (!isVar(term)) continue;

    const name = term["?"];
    if (name in made && valueKey(made[name]!) !== valueKey(places[i]!)) return undefined;
    made[name] = places[i]!;
  }

  return made;
}

// The ways a pattern's clauses hold, from the bindings it starts with: one empty one, or,
// for a not or a branch of an or, the binding it is held against.
export function solve(
  where: Clause[],
  stores: Answering,
  working: Working,
  steps?: Step[],
  start: Binding[] = [{}],
): Binding[] {
  let bindings = start;
  const bound = new Set(Object.keys(start[0] ?? {}));

  // What binds: facts and ors, taken in turn. What only keeps or lets go: nots and tests.
  const binders = new Set<Clause>(where.filter((clause) => "fact" in clause || "or" in clause));
  const guards = new Set(where.filter((clause) => !binders.has(clause)));

  // The variables something can bind; a guard waits only for those of its own among them,
  // so a not may have variables of its own.
  const canBind = new Set([...bound, ...bindable([...binders])]);

  for (const guard of guards) {
    if ("test" in guard) {
      const unbound = guard.names.find((name) => !canBind.has(name));
      if (unbound) throw new Error(`a test reads ${unbound}, which no fact of the pattern binds`);
    }
  }

  const hold = () => {
    for (const guard of [...guards]) {
      const needs = [...varsOf(guard)].filter((name) => canBind.has(name));
      if (!needs.every((name) => bound.has(name))) continue;

      guards.delete(guard);
      bindings = kept(guard, bindings);
    }
  };

  // The bindings a guard keeps. A not is answered once for all of them together, those
  // its clauses still hold for let go; a test is held to each.
  function kept(guard: Clause, given: Binding[]): Binding[] {
    if (!("not" in guard)) return given.filter((binding) => holds(guard, binding));

    const outer = [...varsOf(guard)].filter((name) => bound.has(name));
    const keyOf = (binding: Binding) => outer.map((name) => valueKey(binding[name]!)).join("\u0000");
    const held = new Set(solve(guard.not, stores, working, undefined, given).map(keyOf));

    return given.filter((binding) => !held.has(keyOf(binding)));
  }

  function holds(guard: Clause, binding: Binding): boolean {
    if ("test" in guard)
      return working.test(
        guard.test,
        guard.names.map((name) => binding[name]!),
      );
    if ("not" in guard) return solve(guard.not, stores, working, undefined, [binding]).length === 0;

    return true;
  }

  // What an or reads from outside before it can be answered: what its branches read and
  // do not bind themselves, but something else here binds.
  const readsOutside = (clause: Clause) =>
    "or" in clause
      ? clause.or.flatMap((branch) => {
          const own = bindable(branch);
          return [...new Set(branch.flatMap((inner) => [...varsOf(inner)]))].filter(
            (name) => !own.has(name) && canBind.has(name),
          );
        })
      : [];

  // What a step would cost, judged by one binding: for a fact, how many facts answer it,
  // as many times over as there are bindings where it shares no variable with them; for
  // an or, its branches' cheapest facts together, once what it reads is bound.
  const cost = (clause: Clause, binding: Binding): number => {
    const connected = !bound.size || [...varsOf(clause)].some((name) => bound.has(name));
    const times = connected ? 1 : bindings.length;

    if ("fact" in clause) return stores.count(askedOf(clause.fact, binding)) * times;
    if ("or" in clause) {
      if (!readsOutside(clause).every((name) => bound.has(name))) return Infinity;

      return clause.or.reduce(
        (sum, branch) =>
          sum + Math.min(...branch.map((inner) => ("fact" in inner ? cost(inner, binding) : Infinity))),
        0,
      );
    }

    return Infinity;
  };

  const cheaper = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1);

  hold();

  while (binders.size && bindings.length) {
    const sample = bindings[0]!;
    const next = [...binders].sort((x, y) => cheaper(cost(x, sample), cost(y, sample)))[0]!;
    binders.delete(next);

    let answered = 0;
    const joined: Binding[] = [];

    for (const binding of bindings) {
      if ("fact" in next) {
        const found = stores.answer(askedOf(next.fact, binding));
        answered += found.length;

        for (const fact of found) {
          const made = bindFact(next.fact, fact, binding);
          if (made) joined.push(made);
        }
      } else if ("or" in next) {
        for (const branch of next.or) joined.push(...solve(branch, stores, working, undefined, [binding]));
      }
    }

    steps?.push({
      step: said(next),
      served: "fact" in next ? stores.served(askedOf(next.fact, sample)) : "each branch",
      facts: answered,
      bindings: joined.length,
    });

    bindings = joined;
    bindsOf(next).forEach((name) => bound.add(name));
    hold();
  }

  for (const guard of guards) bindings = kept(guard, bindings);

  return bindings;
}

// An or's branches must each bind the same variables that the rest of the pattern
// uses, or what it gives would differ in shape from branch to branch; variables a branch
// keeps to itself are its own.
export function orProblem(branches: Clause[][], outside: Set<string>) {
  const shapes = branches.map((branch) =>
    [...bindable(branch)]
      .filter((name) => outside.has(name))
      .sort()
      .join(","),
  );

  return shapes.every((shape) => shape === shapes[0])
    ? undefined
    : `each branch of an or binds the same variables, and these bind ${shapes.map((shape) => `(${shape})`).join(" and ")}`;
}

// The variables used anywhere in these clauses but the one given.
export const usedBeside = (where: Clause[], clause: Clause) =>
  new Set(where.filter((each) => each !== clause).flatMap((each) => [...varsOf(each)]));
