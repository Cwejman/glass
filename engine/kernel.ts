// The kernel: how an expression is worked out to a value. An expression is calls of
// functions, and a function is a holon. It gives in one of two ways: natively, by an
// act handed what it is given, or by an expression of other functions, so a function
// written in the field stands beside the native ones and reads as they do.
//
//   1, "words", true, null              a value, standing for itself
//   { $ref: id }                        a holon, or, if it is a function, the function
//   { call: { $ref: f }, with: [ … ] }  the function f, given what it takes
//   { fn: ["m"], gives: e }             a function written in place, a lambda
//   { var: "m" }                        what a lambda was given, by its word
//   { arg: i }                          what a function of one's own was given, by place
//   { list: [ … ] }, { record: { … } }  a list, or a record, each of its parts worked out
//
// Every value a holon holds can be used: its id, name, store, what it is an instance
// of, and every field of its body; where a field of the body shares a name with one of
// these, the holon's own comes first. Every act is total: given what it cannot use, it
// gives null or nothing, never fails, so a guard can always be written. Only what is not
// an expression fails.
//
// Only null and false are false; 0, "" and [] are values like any other. A list of
// holons is a set wherever and, or and not are given one, an empty list the empty set.

import { canonical } from "../integrations/glass/canonical.ts";
import { writtenBy, type LogEntry } from "../integrations/glass/store.ts";
import { storesOf, type Everything, type Known } from "./expression.ts";
import {
  answeringAll,
  indexOf,
  mouldIn as mouldsIn,
  patchedIndex,
  type Answering,
  type FactValue,
  type Index,
} from "./facts.ts";
import { mouldOf, type Mould } from "./moulds.ts";
import { bindable, isVar, orProblem, solve, usedBeside, type Clause, type Step } from "./pattern.ts";
import { wordsOf } from "./words.ts";
import { isRef, references } from "./references.ts";

export type Value = null | boolean | number | string | Value[] | { [key: string]: Value };
export type Expr = unknown;

// What the kernel works over: everything the field holds, and each store's history,
// for what asks of it.
export type Context = { all: Everything; logs?: ReadonlyMap<string, LogEntry[]> };

type Ref = { $ref: string };

// What a lambda closes over: the words around it, and a function of one's own's places.
type Scope = { words: Record<string, Value>; up?: Scope; args?: Value[] };

// A lambda as a value: what it gives, and where it was written. Only the kernel makes
// one, so no value written as data can pass for one.
type Closure = { fn: string[]; gives: Expr; scope: Scope };
const closures = new WeakSet<object>();

const isClosure = (value: unknown): value is Closure =>
  typeof value === "object" && value !== null && closures.has(value);

const closure = (fn: string[], gives: Expr, scope: Scope) => {
  const made = { fn, gives, scope };
  closures.add(made);

  return made as unknown as Value;
};

const ref = (id: string): Ref => ({ $ref: id });

const truly = (value: unknown) => value !== null && value !== undefined && value !== false;

const list = (value: unknown): Value[] =>
  Array.isArray(value) ? value : value === null || value === undefined ? [] : [value as Value];

// A value's identity, for sameness: a holon by its id, a lambda by itself, anything
// else by its canonical text, so records are the same whatever order their keys.
const lambdaKeys = new WeakMap<object, string>();
let lambdas = 0;

function keyOf(value: unknown): string {
  if (isRef(value)) return value.$ref;

  if (isClosure(value)) {
    if (!lambdaKeys.has(value)) lambdaKeys.set(value, `λ${lambdas++}`);
    return lambdaKeys.get(value)!;
  }

  if (Array.isArray(value)) return `[${value.map(keyOf).join(",")}]`;
  if (typeof value === "object" && value !== null)
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${keyOf((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;

  return canonical(value ?? null);
}

const same = (a: unknown, b: unknown) => keyOf(a) === keyOf(b);

const isRecord = (value: unknown): value is Record<string, Value> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !isRef(value) && !isClosure(value);

// The words of a text, or of each text in a list of them, cut as the index cuts them.
const words = (text: unknown): string[] => (Array.isArray(text) ? text.flatMap(words) : wordsOf(text));

// What a search or contains asks, as it was asked before words were cut as the index cuts
// them: the text lower cased and parted at its spaces, each part found within what is said.
const asked = (text: unknown): string[] =>
  Array.isArray(text)
    ? text.flatMap(asked)
    : typeof text === "string"
      ? text.toLocaleLowerCase().split(/\s+/).filter(Boolean)
      : [];

// Which of two values comes first, where both are of one kind.
const order = (a: unknown, b: unknown) =>
  typeof a !== typeof b ? 0 : (a as never) < (b as never) ? -1 : (a as never) > (b as never) ? 1 : 0;

// ---- Acts that need only the values they are given

type Act = (given: Value[]) => Value;

const values: Record<string, Act> = {
  // Lists.
  reverse: ([items]) => [...list(items)].reverse(),
  take: ([items, n]) => list(items).slice(0, Number(n)),
  skip: ([items, n]) => list(items).slice(Number(n)),
  first: ([items]) => list(items)[0] ?? null,
  last: ([items]) => list(items).at(-1) ?? null,
  size: ([items]) => list(items).length,
  has: ([items, item]) => list(items).some((each) => same(each, item)),
  distinct: ([items]) => {
    const seen = new Set<string>();
    return list(items).filter((item) => !seen.has(keyOf(item)) && (seen.add(keyOf(item)), true));
  },
  concat: (lists) => lists.flatMap(list),
  minus: ([from, out]) => {
    const gone = new Set(list(out).map(keyOf));
    return list(from).filter((item) => !gone.has(keyOf(item)));
  },

  // Records.
  put: ([record, key, value]) => ({ ...(isRecord(record) ? record : {}), [String(key)]: value ?? null }),

  // Values.
  else: ([value, otherwise]) => value ?? otherwise ?? null,
  eq: ([a, b]) => same(a, b),
  lt: ([a, b]) => order(a, b) < 0,
  add: ([a, b]) => (typeof a === "number" && typeof b === "number" ? a + b : null),
  mul: ([a, b]) => (typeof a === "number" && typeof b === "number" ? a * b : null),
  round: ([a]) => (typeof a === "number" ? Math.round(a) : null),
  join: ([items, between]) =>
    list(items)
      .filter((item) => item !== null)
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join(typeof between === "string" ? between : ""),
  words: ([text]) => words(text),
  contains: ([text, wanted]) => {
    const said = typeof text === "string" ? text.toLocaleLowerCase() : "";
    return asked(wanted).every((word) => said.includes(word));
  },
  kind: ([value]) => {
    if (value === null) return "null";
    if (Array.isArray(value)) return "list";
    if (isRef(value)) return "holon";
    if (isClosure(value)) return "function";

    return typeof value === "object" ? "record" : typeof value;
  },
};

// ---- The kernel over a field

const nesting = 4000;

// What a lazy act is handed: each of what it is given, to be worked out if needed, and
// a record's one field alone, for a case.
type Deferred = (() => Value) & { key: (key: string) => Value | undefined };
type Lazy = (given: Deferred[]) => Value;

export function kernel(context: Context) {
  const { all } = context;
  const { known } = all;
  const answering = () => answeringOf(all);

  const holonOf = (value: unknown) => (isRef(value) ? known.get(value.$ref)?.holon : undefined);

  const mouldIn = (instance: string[]) =>
    mouldOf(instance.map((type) => known.get(type)?.holon.mould as Mould | undefined));

  // Edges out of a holon: what it is an instance of, and every reference in its body,
  // in the order the body holds them.
  const edgesOut = (value: unknown): Value[] => {
    const holon = holonOf(value);
    if (!holon) return [];

    return [
      ...holon.instance.map((type) => ({ key: "instance", to: ref(type), holds: false })),
      ...references(holon.body, mouldIn(holon.instance)).map(({ id, key, holds }) => ({
        key,
        to: ref(id),
        holds,
      })),
    ];
  };

  // Edges into a holon, the one thing a holon cannot say of itself: the field's index.
  const edgesIn = (value: unknown): Value[] =>
    isRef(value)
      ? (all.holders.get(value.$ref) ?? []).map(({ from, key, holds }) => ({ key, from: ref(from), holds }))
      : [];

  const typeNamedAs = (names: string[]) => (instance: string[]) =>
    instance.some((type) => names.includes(known.get(type)?.holon.name ?? ""));

  // A word is said by what holds it; a lexeme, kept from before the lexicon was a
  // function, says nothing of its own and is never found by a search.
  const isWord = typeNamedAs(["word"]);
  const isWordLike = typeNamedAs(["word", "lexeme"]);

  // What may be said of a holon as text: its name, its own strings but its code, and
  // the words it holds. A word is said by what holds it, so a search lands on a sentence.
  const saying = new Map<string, string>();
  function says(id: string) {
    const kept = saying.get(id);
    if (kept !== undefined) return kept;

    const holon = known.get(id)!.holon;
    const mould = mouldIn(holon.instance);
    const said: string[] = holon.name ? [holon.name] : [];

    const walk = (value: unknown, key?: string): void => {
      if (key?.startsWith("$")) return;

      if (typeof value === "string") said.push(value);
      else if (Array.isArray(value)) value.forEach((item) => walk(item));
      else if (typeof value === "object" && value !== null)
        for (const [inner, held] of Object.entries(value)) walk(held, inner);
    };

    for (const [key, value] of Object.entries(holon.body)) if (mould[key]?.shape !== "code") walk(value);

    for (const { id: part, holds } of references(holon.body, mould)) {
      const held = holds ? known.get(part)?.holon : undefined;
      if (held && isWord(held.instance)) said.push(held.body.text);
    }

    const text = said.join(" ").toLocaleLowerCase();
    saying.set(id, text);

    return text;
  }

  // ---- Sets of holons

  const ids = (value: unknown) =>
    list(value)
      .filter(isRef)
      .map(({ $ref }) => $ref);
  const isSet = (value: unknown) => isRef(value) || (Array.isArray(value) && value.every(isRef));

  // The holons a test keeps, in the field's order.
  const keep = (test: (id: string) => boolean) => [...known.keys()].filter(test).map(ref);

  // The holons reached, in the field's order, without going through all of it.
  const place = new Map([...known.keys()].map((id, i) => [id, i]));
  const inOrder = (reached: Set<string>) =>
    [...reached]
      .filter((id) => place.has(id))
      .sort((a, b) => place.get(a)! - place.get(b)!)
      .map(ref);

  // What the holons given connect to, down what they refer to or up what refers to them.
  const along = (direction: "down" | "up", holding: boolean) => (given: Value[]) => {
    const reached = new Set<string>();

    for (const id of ids(given[0])) {
      const holon = known.get(id)?.holon;
      const edges =
        direction === "down"
          ? holon
            ? references(holon.body, mouldIn(holon.instance))
            : []
          : (all.holders.get(id) ?? []).map(({ from, key, holds }) => ({ id: from, key, holds }));

      for (const edge of edges) if (edge.holds === holding) reached.add(edge.id);
    }

    return inOrder(reached);
  };

  // ---- Applying a function, written in place or kept as a holon

  function apply(fn: unknown, given: Value[], depth: number): Value {
    if (isClosure(fn)) {
      const words = Object.fromEntries(fn.fn.map((word, i) => [word, given[i] ?? null]));
      return evaluate(fn.gives, { words, up: fn.scope }, depth + 1);
    }

    if (isRef(fn) && known.get(fn.$ref)) return called(fn.$ref, given, depth);

    return null;
  }

  // ---- Acts that read the field

  type FieldAct = (given: Value[], depth: number) => Value;

  const field: Record<string, FieldAct> = {
    everything: () => [...known.keys()].map(ref),
    type: ([types]) => {
      const wanted = new Set(ids(types));
      return keep((id) => known.get(id)!.holon.instance.some((type) => wanted.has(type)));
    },
    types: () => keep((id) => known.get(id)!.holon.mould !== undefined),
    store: ([key]) => keep((id) => storesOf(all, id).includes(String(key))),
    stores: () => [...new Set([...known.keys()].flatMap((id) => storesOf(all, id)))],
    children: along("down", true),
    parents: along("up", true),
    points: along("down", false),
    pointers: along("up", false),
    search: ([text]) => {
      const wanted = asked(text);
      if (!wanted.length) return [];

      return keep(
        (id) => !isWordLike(known.get(id)!.holon.instance) && wanted.every((word) => says(id).includes(word)),
      );
    },
    named: ([text]) => {
      const wanted = asked(text);
      if (!wanted.length) return [];

      return keep((id) => {
        const name = known.get(id)!.holon.name?.toLocaleLowerCase();
        return name !== undefined && wanted.every((word) => name.includes(word));
      });
    },
    in: ([holon]) => edgesIn(holon),
    out: ([holon]) => edgesOut(holon),
    says: ([holon]) => (holonOf(holon) ? says((holon as Ref).$ref) : null),
    log: ([store]) =>
      (context.logs?.get(String(store)) ?? []).map(({ at, says, hash, act }) => ({ at, says, hash, act })),
    since: ([store, moment]) => {
      const written = new Set(
        (context.logs?.get(String(store)) ?? []).filter(({ at }) => at > String(moment)).flatMap(writtenBy),
      );

      return keep((id) => written.has(id) && storesOf(all, id).includes(String(store)));
    },

    // How a set is looked at, which the engine reads by its shape; worked out, each
    // gives what it is given.
    group: ([given]) => given ?? [],
    flat: ([given]) => given ?? [],

    // A holon's own values, a record's or a list's.
    get([value, key]) {
      const holon = holonOf(value);

      if (holon) {
        const own: Record<string, Value> = {
          id: holon.id,
          name: holon.name ?? null,
          store: known.get(holon.id)!.store,
          instance: holon.instance.map(ref),
          mould: (holon.mould as Value) ?? null,
        };
        return String(key) in own ? own[String(key)]! : valueOf(holon.body[String(key)]);
      }

      if (Array.isArray(value)) return typeof key === "number" ? (value[key] ?? null) : null;
      if (isRecord(value)) return value[String(key)] ?? null;

      return null;
    },
    keys: ([value]) => {
      const holon = holonOf(value);
      if (holon) return Object.keys(holon.body);

      return isRecord(value) ? Object.keys(value) : [];
    },

    // Lists worked through by a function.
    map: ([items, fn], depth) => list(items).map((item) => apply(fn, [item], depth)),
    filter: ([items, fn], depth) => list(items).filter((item) => truly(apply(fn, [item], depth))),
    fold: ([items, start, fn], depth) =>
      list(items).reduce<Value>((acc, item) => apply(fn, [acc, item], depth), start ?? null),
    sort: ([items, fn], depth) =>
      list(items)
        .map((item) => ({ item, by: fn ? apply(fn, [item], depth) : item }))
        .sort((a, b) => order(a.by, b.by))
        .map(({ item }) => item),
    apply: ([fn, ...given], depth) => apply(fn, given, depth),

    // The walk: a step applied from what was reached, until nothing new is reached, or a
    // depth, or what the stop says; it gives the edges it walked, so a line, a branch
    // and a join can all be drawn from it.
    follow([seeds, step, stop], depth) {
      const depthAt = isRecord(stop) ? stop.depth : undefined;
      const until = isRecord(stop) ? stop.until : undefined;
      const seen = new Set(ids(seeds));
      const walked: Value[] = [];
      let frontier = [...seen];

      for (let down = 1; frontier.length && (typeof depthAt !== "number" || down <= depthAt); down++) {
        const next: string[] = [];

        for (const from of frontier) {
          if (until && down > 1 && truly(apply(until, [ref(from)], depth))) continue;

          for (const reached of list(apply(step, [ref(from)], depth))) {
            const edge = isRef(reached) ? { to: reached, key: null } : isRecord(reached) ? reached : {};
            if (!isRef(edge.to)) continue;

            walked.push({ from: ref(from), to: edge.to, key: edge.key ?? null, depth: down });

            if (!seen.has(edge.to.$ref)) {
              seen.add(edge.to.$ref);
              next.push(edge.to.$ref);
            }
          }
        }

        frontier = next;
      }

      return walked;
    },

    // A word said is a clause of a pattern, and nothing outside one.
    said: () => {
      throw new Error("said(e, a, w) is a clause of a pattern, asked within find");
    },

    // Not is one lattice with and and or: of a set of holons, everything else the field
    // holds; of a truth, its opposite.
    not: ([value]) => {
      if (!isSet(value)) return !truly(value);

      const out = new Set(ids(value));
      return keep((id) => !out.has(id));
    },
  };

  // What is worked out only as it is needed: a branch, and the rest of a conjunction.
  // And and or given sets of holons are their meet and join, in the field's order.
  const lazy: Record<string, Lazy> = {
    if: ([test, then, otherwise]) => (truly(test?.()) ? (then?.() ?? null) : (otherwise?.() ?? null)),

    case([value, cases, otherwise]) {
      const key = value?.();
      const chosen = typeof key === "string" ? cases?.key(key) : undefined;

      return chosen !== undefined ? chosen : (otherwise?.() ?? null);
    },

    and(given) {
      let last: Value = true;
      const sets: Set<string>[] = [];

      for (const each of given) {
        last = each();

        if (isSet(last)) sets.push(new Set(ids(last)));
        else if (!truly(last)) return last;
      }

      return sets.length ? keep((id) => sets.every((set) => set.has(id))) : last;
    },

    or(given) {
      const sets: Set<string>[] = [];

      for (const each of given) {
        const value = each();

        if (isSet(value)) sets.push(new Set(ids(value)));
        else if (truly(value)) return value;
      }

      return sets.length ? keep((id) => sets.some((set) => set.has(id))) : false;
    },
  };

  const natives = { ...values, ...field };

  // ---- Patterns

  // A function whose arguments are clauses, read as they are written, not worked out.
  const nativeOf = (expression: unknown) => {
    const id = (expression as { call?: Ref })?.call?.$ref;
    return id ? (known.get(id)?.holon.body as { native?: string } | undefined)?.native : undefined;
  };

  // One clause of a pattern, as written: a fact [e, a, v], whose values are worked out
  // where they stand; not(…); or(…), each branch one clause or and(…) of several; or a
  // test, a lambda given the variables its words name.
  function clauseOf(expression: unknown, scope: Scope, depth: number): Clause {
    const form = expression as Record<string, unknown>;
    const given = (form?.with ?? []) as unknown[];
    const term = (each: unknown) => (isVar(each) ? each : evaluate(each, scope, depth));

    if (Array.isArray(form?.list) && form.list.length === 3)
      return { fact: (form.list as unknown[]).map(term) as [unknown, unknown, unknown] };

    if (nativeOf(form) === "not") return { not: given.map((each) => clauseOf(each, scope, depth)) };

    if (nativeOf(form) === "said") {
      if (given.length !== 3) throw new Error("a word said is said(e, a, w): a holon, a key, and a word");

      const terms = given.map(term) as [unknown, unknown, unknown];
      const several = isVar(terms[2]) ? 0 : wordsOf(terms[2]).length;
      if (several > 1)
        throw new Error(`a word said is one word, and ${JSON.stringify(terms[2])} is ${several}`);

      return { fact: terms, words: true };
    }

    if (nativeOf(form) === "or") {
      const branches = given.map((branch) =>
        nativeOf(branch) === "and"
          ? ((branch as { with?: unknown[] }).with ?? []).map((each) => clauseOf(each, scope, depth))
          : [clauseOf(branch, scope, depth)],
      );
      return { or: branches };
    }

    if (Array.isArray(form?.fn)) return { test: evaluate(form, scope, depth), names: form.fn as string[] };

    throw new Error(
      "a clause is a fact [e, a, v], not(…), or(…), or a test, a lambda of the variables it reads",
    );
  }

  // What a pattern finds, and how: one variable's values, or a record of several, each
  // distinct, for every way its clauses hold.
  function find(given: unknown[], scope: Scope, depth: number, steps?: Step[]): Value {
    const [spec, ...clauses] = given;
    const shape = isVar(spec)
      ? spec["?"]
      : Object.fromEntries(
          Object.entries(((spec as { record?: Record<string, unknown> })?.record ?? {}) as object).map(
            ([key, each]) => {
              if (!isVar(each)) throw new Error("what a pattern finds is ?x, or a record of them, {x: ?x}");
              return [key, each["?"]];
            },
          ),
        );

    const where = clauses.map((each) => clauseOf(each, scope, depth));
    const found = bindable(where);

    for (const name of typeof shape === "string" ? [shape] : Object.values(shape))
      if (!found.has(name)) throw new Error(`the pattern finds ?${name}, which no fact of it binds`);

    for (const clause of where) {
      const outside = new Set([
        ...usedBeside(where, clause),
        ...(typeof shape === "string" ? [shape] : Object.values(shape)),
      ]);
      const problem = "or" in clause ? orProblem(clause.or, outside) : undefined;
      if (problem) throw new Error(problem);
    }

    const bindings = solve(
      where,
      answering(),
      { test: (fn, values) => truly(apply(fn, values as Value[], depth)) },
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

  // Natives that read their arguments as written: a pattern, and the plan of one.
  const structural: Record<string, (given: unknown[], scope: Scope, depth: number) => Value> = {
    find,
    explain([pattern], scope, depth) {
      if (nativeOf(pattern) !== "find") throw new Error("explain is given a pattern, find(…)");

      const steps: Step[] = [];
      const found = find((pattern as { with?: unknown[] }).with ?? [], scope, depth, steps);

      return { found: Array.isArray(found) ? found.length : 0, steps: steps as unknown as Value };
    },
  };

  // ---- Working out

  // A function kept as a holon, given values: natively, or by what it gives.
  function called(id: string, given: Value[], depth: number): Value {
    const holon = known.get(id)?.holon;
    const body = (holon?.body ?? {}) as { native?: string; gives?: Expr };

    if (body.native && natives[body.native]) return natives[body.native]!(given, depth);
    if (body.native && structural[body.native])
      throw new Error(
        `${holon?.name} reads what it is given as written, so it is called, not given to another`,
      );

    // A lazy act handed values already worked out, as when it is given to map.
    if (body.native && lazy[body.native]) return lazy[body.native]!(given.map((each) => valued(each)));

    if (body.gives === undefined) throw new Error(`${holon?.name ?? id} is not a function`);

    const gives = body.gives as { fn?: unknown; gives?: Expr };

    return Array.isArray(gives?.fn)
      ? apply(closure(gives.fn as string[], gives.gives, { words: {} }), given, depth)
      : evaluate(body.gives, { words: {}, args: given }, depth + 1);
  }

  // What a lazy act is handed for a value already worked out; a case's record answers by key.
  function valued(value: Value): Deferred {
    const thunk = () => value;
    return Object.assign(thunk, { key: (key: string) => (isRecord(value) ? value[key] : undefined) });
  }

  function lookUp(scope: Scope | undefined, word: string): Value {
    for (let at = scope; at; at = at.up) if (word in at.words) return at.words[word]!;
    throw new Error(`${word} is not a word any lambda around it takes`);
  }

  function argument(scope: Scope | undefined, place: number): Value {
    for (let at = scope; at; at = at.up) if (at.args) return at.args[place] ?? null;
    throw new Error("an argument is given only within a function of one's own");
  }

  // What a lazy act is handed for an expression: worked out when asked, and a record's
  // field alone when a case asks for one.
  function deferred(expression: Expr, scope: Scope, depth: number): Deferred {
    const thunk = () => evaluate(expression, scope, depth);
    const record = (expression as { record?: Record<string, Expr> } | null)?.record;

    return Object.assign(thunk, {
      key: (key: string) => (record && key in record ? evaluate(record[key], scope, depth) : undefined),
    });
  }

  function evaluate(expression: Expr, scope: Scope = { words: {} }, depth = 0): Value {
    if (depth > nesting) throw new Error(`an expression nests at most ${nesting} deep`);
    if (expression === null || typeof expression !== "object") return (expression ?? null) as Value;
    if (Array.isArray(expression)) throw new Error("a list is written { list: [ … ] }");

    const form = expression as Record<string, unknown>;

    if ("$ref" in form) return ref(form.$ref as string);
    if ("var" in form) return lookUp(scope, form.var as string);
    if ("?" in form) throw new Error(`?${form["?"]} is a pattern's variable, and stands only within find`);
    if ("arg" in form) return argument(scope, form.arg as number);
    if ("fn" in form) return closure(form.fn as string[], form.gives, scope);
    if ("list" in form) return (form.list as Expr[]).map((each) => evaluate(each, scope, depth));
    if ("record" in form)
      return Object.fromEntries(
        Object.entries(form.record as object).map(([key, each]) => [key, evaluate(each, scope, depth)]),
      );

    if ("call" in form) {
      const id = (form.call as Ref | undefined)?.$ref ?? "";
      const holon = known.get(id)?.holon;
      if (!holon) throw new Error(`the function ${id} is not in the field`);

      const given = (form.with ?? []) as Expr[];
      const native = (holon.body as { native?: string }).native;

      if (native && structural[native]) return structural[native]!(given, scope, depth + 1);
      if (native && lazy[native]) return lazy[native]!(given.map((each) => deferred(each, scope, depth + 1)));

      return called(
        id,
        given.map((each) => evaluate(each, scope, depth + 1)),
        depth + 1,
      );
    }

    throw new Error(`not an expression: ${JSON.stringify(expression).slice(0, 80)}`);
  }

  return {
    evaluate: (expression: Expr) => evaluate(expression),
    natives: [...Object.keys(natives), ...Object.keys(lazy)],
  };
}

// What the field's stores answer a pattern's facts from: each store's index, the stores
// asked as one. It is the same for every reading of the same holons, as one of history.
const indexes = new WeakMap<Everything["known"], Answering>();

export function answeringOf(all: Everything): Answering {
  let made = indexes.get(all.known);
  if (!made) indexes.set(all.known, (made = answeringAll([...storeIndexesOf(all).values()])));

  return made;
}

type Held = readonly Known[];

// A holon's version as its store says it: the block it was read from, or, where the
// store says none, the very holon as it was read. A type's version names its store as
// well, as another store may come to claim it first.
type Version = string | Known;
const versionOf = (known: Known): Version => known.block ?? known;
const typeVersionOf = (known: Known | undefined): Version | undefined =>
  known && (known.block === undefined ? known : `${known.store}\u0000${known.block}`);

// A store's index, kept beside what it was made of: each holon it keeps by its version,
// and each type they are read through by its version. Kept by the key the store is
// attached by on a shelf each field hands to the next, so a store a commit changed is
// patched from the index before it. The shelf is the one thing a read writes: what it
// keeps is worked out, never said, so an old field asked late leaves only a longer patch
// for the next.
export type Kept = {
  index: Index;
  versions: ReadonlyMap<string, Version>;
  types: ReadonlyMap<string, Version | undefined>;
};

export type Shelf = Map<string, Kept>;

// How each store's index came to be, the first time a field asked it: kept as it was,
// patched by what changed, or made fresh.
export type Made = "kept" | "patched" | "fresh";
const howMade = new WeakMap<Everything["known"], Map<string, Made>>();

export function howIndexed(all: Everything): ReadonlyMap<string, Made> {
  answeringOf(all);
  return howMade.get(all.known)!;
}

// So many of a store's holons changed, or more, and its index is made fresh: a patch
// costs a little for each holon it says again, and copies every order once.
const mostPatched = 1 / 4;

// A holon a store keeps where the field reads another store's copy: said here only as
// kept here, so its version here is only that.
const keptHere = "kept here, read from another store";

// A store's holons as an index is made of them: each by its version, those the field
// reads from another store apart, and the types its own are read through; and, against
// what was kept, the holons to be said again: those whose version changed, came or went,
// or whose type changed.
function changesOf(held: Held, all: Everything, kept: Kept | undefined) {
  const also = new Set<Known>();
  const versions = new Map<string, Version>();
  const types = new Map<string, Version | undefined>();
  const dirty = new Set<string>();
  // How many of those kept are held still, so those gone are looked for only if any are.
  let stillHeld = 0;

  for (const each of held) {
    const id = each.holon.id;
    const readHere = all.known.get(id) === each;

    if (readHere) {
      for (const type of each.holon.instance)
        if (!types.has(type)) types.set(type, typeVersionOf(all.known.get(type)));
    } else also.add(each);

    const version = readHere ? versionOf(each) : keptHere;
    versions.set(id, version);
    const was = kept?.versions.get(id);
    if (was !== undefined) stillHeld++;
    if (was !== version) dirty.add(id);
  }

  if (kept) {
    if (stillHeld < kept.versions.size)
      for (const id of kept.versions.keys()) if (!versions.has(id)) dirty.add(id);

    const changedTypes = new Set([...types].filter(([id, version]) => kept.types.get(id) !== version).map(([id]) => id));
    if (changedTypes.size)
      for (const each of held)
        if (!also.has(each) && each.holon.instance.some((type) => changedTypes.has(type))) dirty.add(each.holon.id);
  }

  return { also, dirty, versions, types };
}

function storeIndex(key: string, held: Held, all: Everything): { index: Index; how: Made } {
  const kept = all.shelf.get(key);
  const { also, dirty, versions, types } = changesOf(held, all, kept);
  const mould = mouldsIn(all.known);

  const keep = (index: Index, how: Made) => {
    all.shelf.set(key, { index, versions, types });
    return { index, how };
  };

  if (!kept) return keep(indexOf(held, mould, also), "fresh");
  if (!dirty.size) return keep(kept.index, "kept");

  const patched =
    dirty.size <= Math.max(held.length, kept.versions.size) * mostPatched
      ? patchedIndex(kept.index, held, also, dirty, mould)
      : undefined;

  return patched ? keep(patched, "patched") : keep(indexOf(held, mould, also), "fresh");
}

// Each store's index, by the key it is attached by.
export function storeIndexesOf(all: Everything): Map<string, Answering> {
  const indexes = [...all.held].map(([key, held]) => [key, storeIndex(key, held, all)] as const);
  if (!howMade.has(all.known)) howMade.set(all.known, new Map(indexes.map(([key, { how }]) => [key, how])));

  return new Map(indexes.map(([key, { index }]) => [key, index]));
}

// The kernel over everything a field holds, made once, so what it has worked out of the
// field, as what each holon says, is kept while the field stands.
const kernels = new WeakMap<Everything, ReturnType<typeof kernel>>();

export function kernelOf(all: Everything) {
  let made = kernels.get(all);
  if (!made) kernels.set(all, (made = kernel({ all, logs: all.logs })));

  return made;
}

// A body's values as values: a reference becomes the holon it names, and what glass
// marks with $ is the store's, not the holon's.
function valueOf(value: unknown): Value {
  if (Array.isArray(value)) return value.map(valueOf);
  if (isRef(value)) return ref(value.$ref);

  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !key.startsWith("$"))
        .map(([key, inner]) => [key, valueOf(inner)]),
    );

  return (value ?? null) as Value;
}

// A value as it may leave the kernel: a lambda is said as what it is, not where it was.
export function plain(value: Value): Value {
  if (isClosure(value)) return { function: value.fn.join(", ") };
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, plain(inner)]));

  return value;
}
