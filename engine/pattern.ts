// A pattern: what must hold, said as clauses over facts, its variables shared between
// them as the links. It says what, not how, so how it is answered is planned: each step
// taken when it is cheapest for what is bound so far, asked of the stores, and joined
// by the variables it shares with what came before.
//
// A clause is one of four:
//   a fact      [e, a, v], any of the three a variable, the rest values; or a word said,
//               said(e, a, w), the strings under a cut into words, w one of them
//   not         clauses that must not hold for the bindings made, its own variables free
//   or          branches of clauses, any of which may hold, each binding the same variables
//   a test      a function given the values of the variables its words name, kept if true
//
// What it gives is every way the clauses hold, each a binding of its variables; what of
// those is found, and in what shape, the one asking says.

import type { Answering, Asked, Fact, FactValue } from "./facts.ts";
import { keyOfFact, valueKey } from "./facts.ts";
import { isRef } from "./moulds.ts";
import { wordsOf } from "./words.ts";

export type Var = { "?": string };
export type Clause =
  | { fact: [unknown, unknown, unknown]; words?: true }
  | { not: Clause[] }
  | { or: Clause[][] }
  | { test: unknown; names: string[] };

type FactClause = Extract<Clause, { fact: unknown }>;

export type Binding = Record<string, FactValue>;

// What the kernel gives a pattern: a test held to the values it names.
export type Working = { test(fn: unknown, given: FactValue[]): boolean };

// The most ways a pattern may hold before it is refused, so a pattern whose clauses share
// no variable cannot join everything with everything and stop the reader.
export const most = 1_000_000;

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
  if ("fact" in clause) {
    const terms = clause.fact.map((term) =>
      isVar(term) ? `?${term["?"]}` : isRef(term) ? `@${term.$ref}` : JSON.stringify(term),
    );
    return clause.words ? `said(${terms.join(", ")})` : `[${terms.join(", ")}]`;
  }
  if ("not" in clause) return `not(${clause.not.map(said).join(", ")})`;
  if ("or" in clause) return `or(${clause.or.map((branch) => branch.map(said).join(" and ")).join(", ")})`;

  return `test(${clause.names.join(", ")})`;
};

// A value as the one word it says, cut and folded as the index cuts them; null where it
// says no word or several, which no word said can match.
const oneWord = (value: unknown): string | null => {
  const words = wordsOf(value);
  return words.length === 1 ? words[0]! : null;
};

// A value's key where it stands in a fact's place: in a word said's third place, the
// word it says, so Cat and cat are one; one that is no word, a key nothing has.
const keyAt = (value: FactValue, i: number, words?: true) =>
  words && i === 2 ? valueKey(oneWord(value) ?? "\u0000no word") : valueKey(value);

// What a fact asks, given one binding: its values, and its variables where bound.
function askedOf([e, a, v]: [unknown, unknown, unknown], binding: Binding, words?: true): Asked {
  const value = (term: unknown) => (isVar(term) ? binding[term["?"]] : term);
  const [held, key, valued] = [value(e), value(a), value(v)];

  // A holon's place known as what is not a holon, or a key as what is not a key, matches nothing.
  if ((held !== undefined && !isRef(held)) || (key !== undefined && typeof key !== "string"))
    return { nothing: true };

  // A word asked that is not one word matches nothing.
  const asked = words && valued !== undefined ? oneWord(valued) : (valued as FactValue | undefined);
  if (asked === null) return { nothing: true };

  return {
    ...(isRef(held) ? { e: held.$ref } : {}),
    ...(typeof key === "string" ? { a: key } : {}),
    ...(asked !== undefined ? { v: asked } : {}),
    ...(words ? { words } : {}),
  };
}

// What stands in each place of a fact, and its key.
const placeOf = (fact: Fact, i: number): FactValue =>
  i === 0 ? { $ref: fact.e } : i === 1 ? fact.a : fact.v;
const placeKey = (fact: Fact, i: number) => (i === 0 ? fact.e : i === 1 ? valueKey(fact.a) : keyOfFact(fact));

// A binding made larger by one fact, or nothing where the fact disagrees with it.
function bindFact(terms: unknown[], fact: Fact, binding: Binding, words?: true): Binding | undefined {
  const made = { ...binding };

  for (const [i, term] of terms.entries()) {
    if (!isVar(term)) continue;

    const name = term["?"];
    if (name in made) {
      if (keyAt(made[name]!, i, words) !== placeKey(fact, i)) return undefined;
    } else made[name] = placeOf(fact, i);
  }

  return made;
}

// The variables of a fact already bound, each with the first place it stands in.
function sharedPlaces(terms: unknown[], bound: Set<string>): [string, number][] {
  const shared = new Map<string, number>();

  terms.forEach((term, i) => {
    if (isVar(term) && bound.has(term["?"]) && !shared.has(term["?"])) shared.set(term["?"], i);
  });

  return [...shared];
}

// Asking a store costs something of its own, beside what it gives; it is weighed as four
// facts given. A judgement, not a measure: on glass's own store 85,000 asks of one fact
// each took about 75 ms, where a fact joined from what was asked once costs far less.
const asking = 4;

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
    const within: Step[] = [];
    const held = new Set(solve(guard.not, stores, working, within, given).map(keyOf));
    steps?.push(...within.map((step) => ({ ...step, step: `within not: ${step.step}` })));

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

  // How a fact is best asked, and what it would cost, judged by one binding. Bound to
  // what came before, it is asked once for every binding, each telling the store more,
  // or, where that costs more, once for them all, with only what it says itself, and
  // joined here by the variables they share. Bound to nothing before it, it is asked
  // once and joined with every binding.
  const howAsked = ({ fact: terms, words }: FactClause, binding: Binding) => {
    const shared = sharedPlaces(terms, bound);

    // A word said is asked only once its key is known; with a key yet to be bound it waits,
    // and it is never asked once for all bindings, each of which may name another key.
    const keyed = !isVar(terms[1]);
    if (words && !keyed && !((terms[1] as Var)["?"] in binding))
      return { once: false, shared, cost: Number.POSITIVE_INFINITY };
    const each = stores.count(askedOf(terms, binding, words));

    if (bound.size && !shared.length) return { once: false, shared, cost: each * bindings.length };

    const eachTime = bindings.length * (each + asking);
    const once =
      shared.length && (keyed || !words)
        ? stores.count(askedOf(terms, {}, words)) + asking + bindings.length
        : Infinity;

    return once < eachTime ? { once: true, shared, cost: once } : { once: false, shared, cost: eachTime };
  };

  // What a step would cost: a fact as it is best asked; an or, its branches' cheapest
  // facts together, once what it reads is bound.
  const cost = (clause: Clause, binding: Binding): number => {
    if ("fact" in clause) return howAsked(clause, binding).cost;
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
    let served = "each branch";
    const joined: Binding[] = [];

    const join = (terms: unknown[], found: Fact[], binding: Binding, words?: true) => {
      for (const fact of found) {
        const made = bindFact(terms, fact, binding, words);
        if (made) joined.push(made);
      }

      if (joined.length > most)
        throw new Error(
          `the pattern holds more than ${most.toLocaleString("en")} ways after ${said(next)}; give its clauses a variable in common`,
        );
    };

    const eachOf = ({ fact: terms, words }: FactClause, binding: Binding) => {
      const found = stores.answer(askedOf(terms, binding, words));
      answered += found.length;
      join(terms, found, binding, words);
    };

    if ("fact" in next) {
      const { once, shared } = howAsked(next, sample);

      if (once) {
        const unbound = askedOf(next.fact, {}, next.words);
        const found = stores.answer(unbound);
        answered = found.length;
        served = `${stores.served(unbound)}, once for all, joined by ${shared.map(([name]) => `?${name}`).join(", ")}`;

        const byKey = new Map<string, Fact[]>();
        for (const fact of found) {
          const key = shared.map(([, i]) => placeKey(fact, i)).join("\u0000");
          const list = byKey.get(key);
          if (list) list.push(fact);
          else byKey.set(key, [fact]);
        }

        // A binding an or left without one of the shared variables is asked on its own.
        for (const binding of bindings) {
          if (shared.every(([name]) => name in binding))
            join(
              next.fact,
              byKey.get(shared.map(([name, i]) => keyAt(binding[name]!, i, next.words)).join("\u0000")) ?? [],
              binding,
              next.words,
            );
          else eachOf(next, binding);
        }
      } else {
        served = stores.served(askedOf(next.fact, sample, next.words));
        for (const binding of bindings) eachOf(next, binding);
      }
    } else if ("or" in next) {
      for (const binding of bindings)
        for (const branch of next.or) joined.push(...solve(branch, stores, working, undefined, [binding]));
    }

    steps?.push({ step: said(next), served, facts: answered, bindings: joined.length });

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
