// A pattern: what must hold, said as clauses over facts, its variables shared between
// them as the links. It says what, not how, so how it is answered is planned: each step
// taken when it is cheapest for what is bound so far, asked of every store, and joined
// here by the variables it shares with what came before. Each store's index answers
// facts; the joining is the engine's.
//
// A clause is one of four:
//   a fact      [e, a, v], any of the three a variable, the rest values; or a word said,
//               said(e, a, w), the strings under a cut into words, w one of them
//   not         clauses that must not hold for the bindings made, its own variables free
//   or          branches of clauses, any of which may hold, each binding the same variables
//   a test      a function given the values of the variables its words name, kept if true
//
// A store does not say how many facts it would give, so what a step costs is judged from
// what it knows: a holon's own facts are few, a key and a value few more, unless the key
// is instance, which a type may have many of, and every fact under a key many.

import type { Field } from "./field.ts";
import { wordsOf } from "./words.ts";

export type Var = { "?": string };
export type Clause =
  | { fact: [unknown, unknown, unknown]; words?: true }
  | { not: Clause[] }
  | { or: Clause[][] }
  | { test: unknown; names: string[] };

type FactClause = Extract<Clause, { fact: unknown }>;

export type FactValue = string | number | boolean | { $ref: string };
type Fact = { e: string; a: string; v: FactValue };
export type Binding = Record<string, FactValue>;

// What a clause knows before it is asked: a holon, a key, a value, any or none; or that
// it can match nothing, as when what stands for a holon is not one.
type Asked = { e?: string; a?: string; v?: FactValue; words?: true; nothing?: true };

// What working a pattern out needs beside the stores: a test held to the values it names.
export type Working = { test(fn: unknown, given: FactValue[]): Promise<boolean> };

// The most ways a pattern may hold before it is refused, so a pattern whose clauses share
// no variable cannot join everything with everything and stop the worker.
export const most = 1_000_000;

// How each step was answered, so a plan can be said.
export type Step = { step: string; served: string; facts: number; bindings: number };

const isRefValue = (value: unknown): value is { $ref: string } =>
  typeof value === "object" && value !== null && typeof (value as { $ref?: unknown }).$ref === "string";

export const isVar = (term: unknown): term is Var =>
  typeof term === "object" && term !== null && typeof (term as Var)["?"] === "string";

// A value's key in a join: a holon by its id, anything else by its kind and text.
const valueKey = (value: FactValue) => (isRefValue(value) ? value.$ref : `${typeof value}:${value}`);

// ---- Asking the stores

// What every store answers to a clause, as facts.
async function answer(field: Field, asked: Asked): Promise<Fact[]> {
  if (asked.nothing) return [];
  const { e, a, v, words } = asked;

  // The words a holon known says under a key are cut from it here, as the index cuts
  // them, where no word is given to ask the index by.
  if (words && v === undefined) {
    if (e === undefined)
      throw new Error("a word said is asked of a word known or a holon known, said(h, key, ?w)");
    const kept = await field.holon(e);
    const held = a === "name" ? kept?.holon.name : kept?.holon.body[a!];
    const said = (Array.isArray(held) ? held : [held]).flatMap(wordsOf);
    return [...new Set(said)].map((word) => ({ e, a: a!, v: word }));
  }

  if (words) {
    const found = await field.said(a!, v as string);
    return found.filter((fact) => e === undefined || fact.e === e) as Fact[];
  }

  // The store a holon is read from is a fact of the read, not of any store.
  if (a === "store") {
    if (e === undefined) throw new Error('the store of a holon is asked of a holon known, [h, "store", ?s]');
    const kept = await field.holon(e);
    return kept && (v === undefined || v === kept.store) ? [{ e, a, v: kept.store }] : [];
  }

  return (await field.facts({ e, a, v })) as Fact[];
}

// What a clause is judged to cost, by what it knows.
function count({ e, a, v, words, nothing }: Asked) {
  if (nothing) return 0;
  if (e !== undefined) return 1;
  if (words) return v !== undefined ? 20 : Number.POSITIVE_INFINITY;
  if (a !== undefined && v !== undefined) return a === "instance" ? 1_000 : 20;
  if (v !== undefined) return 50;
  if (a !== undefined) return 100_000;
  return Number.POSITIVE_INFINITY;
}

function servedBy({ e, a, v, words }: Asked) {
  if (e !== undefined) return a !== undefined ? "by holon and key" : "by holon";
  if (words) return "by word";
  if (a !== undefined && v !== undefined) return "by key and value";
  if (v !== undefined) return "by reference";
  return "by key";
}

// ---- Clauses

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
      isVar(term) ? `?${term["?"]}` : isRefValue(term) ? `@${term.$ref}` : JSON.stringify(term),
    );
    return clause.words ? `said(${terms.join(", ")})` : `[${terms.join(", ")}]`;
  }
  if ("not" in clause) return `not(${clause.not.map(said).join(", ")})`;
  if ("or" in clause) return `or(${clause.or.map((branch) => branch.map(said).join(" and ")).join(", ")})`;

  return `test(${clause.names.join(", ")})`;
};

// A value as the one word it says, or null where it says none or several.
const oneWord = (value: unknown): string | null => {
  const words = wordsOf(value);
  return words.length === 1 ? words[0]! : null;
};

// A value's key where it stands in a fact's place: in a word said's third place, the
// word it says, so Cat and cat are one.
const keyAt = (value: FactValue, i: number, words?: true) =>
  words && i === 2 ? valueKey(oneWord(value) ?? "\u0000no word") : valueKey(value);

// What a fact asks, given one binding: its values, and its variables where bound.
function askedOf([e, a, v]: [unknown, unknown, unknown], binding: Binding, words?: true): Asked {
  const value = (term: unknown) => (isVar(term) ? binding[term["?"]] : term);
  const [held, key, valued] = [value(e), value(a), value(v)];

  if ((held !== undefined && !isRefValue(held)) || (key !== undefined && typeof key !== "string"))
    return { nothing: true };

  const asked = words && valued !== undefined ? oneWord(valued) : (valued as FactValue | undefined);
  if (asked === null) return { nothing: true };

  return {
    ...(isRefValue(held) ? { e: held.$ref } : {}),
    ...(typeof key === "string" ? { a: key } : {}),
    ...(asked !== undefined ? { v: isRefValue(asked) ? { $ref: asked.$ref } : asked } : {}),
    ...(words ? { words } : {}),
  };
}

const placeOf = (fact: Fact, i: number): FactValue =>
  i === 0 ? { $ref: fact.e } : i === 1 ? fact.a : fact.v;
const placeKey = (fact: Fact, i: number) => (i === 0 ? fact.e : valueKey(i === 1 ? fact.a : fact.v));

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

// Asking the stores costs something of its own, beside what they give; it is weighed as
// four facts given.
const asking = 4;

// ---- Solving

// The ways a pattern's clauses hold, from the bindings it starts with: one empty one, or,
// for a not or a branch of an or, the binding it is held against.
export async function solve(
  where: Clause[],
  field: Field,
  working: Working,
  steps?: Step[],
  start: Binding[] = [{}],
): Promise<Binding[]> {
  let bindings = start;
  const bound = new Set(Object.keys(start[0] ?? {}));

  const binders = new Set<Clause>(where.filter((clause) => "fact" in clause || "or" in clause));
  const guards = new Set(where.filter((clause) => !binders.has(clause)));
  const canBind = new Set([...bound, ...bindable([...binders])]);

  for (const guard of guards)
    if ("test" in guard) {
      const unbound = guard.names.find((name) => !canBind.has(name));
      if (unbound) throw new Error(`a test reads ${unbound}, which no fact of the pattern binds`);
    }

  // The guards whose variables are bound, held to the bindings.
  async function hold() {
    for (const guard of [...guards]) {
      const needs = [...varsOf(guard)].filter((name) => canBind.has(name));
      if (!needs.every((name) => bound.has(name))) continue;

      guards.delete(guard);
      bindings = await kept(guard, bindings);
    }
  }

  // The bindings a guard keeps. A not is answered once for all of them together, those
  // its clauses still hold for let go; a test is held to each.
  async function kept(guard: Clause, given: Binding[]): Promise<Binding[]> {
    if ("test" in guard) {
      const held = await Promise.all(
        given.map((binding) =>
          working.test(
            guard.test,
            guard.names.map((name) => binding[name]!),
          ),
        ),
      );
      return given.filter((_, i) => held[i]);
    }
    if (!("not" in guard)) return given;

    const outer = [...varsOf(guard)].filter((name) => bound.has(name));
    const keyOf = (binding: Binding) => outer.map((name) => valueKey(binding[name]!)).join("\u0000");
    const within: Step[] = [];
    const held = new Set((await solve(guard.not, field, working, within, given)).map(keyOf));
    steps?.push(...within.map((step) => ({ ...step, step: `within not: ${step.step}` })));

    return given.filter((binding) => !held.has(keyOf(binding)));
  }

  // What an or reads from outside before it can be answered.
  const readsOutside = (clause: Clause) =>
    "or" in clause
      ? clause.or.flatMap((branch) => {
          const own = bindable(branch);
          return [...new Set(branch.flatMap((inner) => [...varsOf(inner)]))].filter(
            (name) => !own.has(name) && canBind.has(name),
          );
        })
      : [];

  // How a fact is best asked, and what it would cost, judged by one binding: once for
  // every binding, each telling the stores more, or once for them all, joined here.
  const howAsked = ({ fact: terms, words }: FactClause, binding: Binding) => {
    const shared = sharedPlaces(terms, bound);

    const keyed = !isVar(terms[1]);
    if (words && !keyed && !((terms[1] as Var)["?"] in binding))
      return { once: false, shared, cost: Number.POSITIVE_INFINITY };
    const each = count(askedOf(terms, binding, words));

    if (bound.size && !shared.length) return { once: false, shared, cost: each * bindings.length };

    const eachTime = bindings.length * (each + asking);
    const once =
      shared.length && (keyed || !words)
        ? count(askedOf(terms, {}, words)) + asking + bindings.length
        : Infinity;

    return once < eachTime ? { once: true, shared, cost: once } : { once: false, shared, cost: eachTime };
  };

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

  await hold();

  while (binders.size && bindings.length) {
    const sample = bindings[0]!;
    const next = [...binders].sort((x, y) => cost(x, sample) - cost(y, sample) || 0)[0]!;
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

    // Each binding's own question, asked of the stores together.
    const eachOf = async ({ fact: terms, words }: FactClause, all: Binding[]) => {
      const found = await Promise.all(all.map((binding) => answer(field, askedOf(terms, binding, words))));
      all.forEach((binding, i) => {
        answered += found[i]!.length;
        join(terms, found[i]!, binding, words);
      });
    };

    if ("fact" in next) {
      const { once, shared } = howAsked(next, sample);

      if (once) {
        const unbound = askedOf(next.fact, {}, next.words);
        const found = await answer(field, unbound);
        answered = found.length;
        served = `${servedBy(unbound)}, once for all, joined by ${shared.map(([name]) => `?${name}`).join(", ")}`;

        const byKey = new Map<string, Fact[]>();
        for (const fact of found) {
          const key = shared.map(([, i]) => placeKey(fact, i)).join("\u0000");
          const list = byKey.get(key);
          if (list) list.push(fact);
          else byKey.set(key, [fact]);
        }

        const alone: Binding[] = [];
        for (const binding of bindings) {
          if (shared.every(([name]) => name in binding))
            join(
              next.fact,
              byKey.get(shared.map(([name, i]) => keyAt(binding[name]!, i, next.words)).join("\u0000")) ?? [],
              binding,
              next.words,
            );
          else alone.push(binding);
        }
        if (alone.length) await eachOf(next, alone);
      } else {
        served = servedBy(askedOf(next.fact, sample, next.words));
        await eachOf(next, bindings);
      }
    } else if ("or" in next) {
      const branches = await Promise.all(
        bindings.map((binding) =>
          Promise.all(next.or.map((branch) => solve(branch, field, working, undefined, [binding]))),
        ),
      );
      for (const each of branches) for (const branch of each) joined.push(...branch);
    }

    steps?.push({ step: said(next), served: served, facts: answered, bindings: joined.length });

    bindings = joined;
    bindsOf(next).forEach((name) => bound.add(name));
    await hold();
  }

  for (const guard of guards) bindings = await kept(guard, bindings);

  return bindings;
}

// An or's branches must each bind the same variables that the rest of the pattern uses.
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
