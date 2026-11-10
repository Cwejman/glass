// A prototype of a kernel for functions: the few acts the engine would give, upon which
// every other function is written in the field. It stands apart from the engine and is
// wired into nothing; it exists to be grounded in real cases (kernel.test.ts) before
// anything is built upon it.
//
// Every value a holon holds can be used: its id, name, store, what it is an instance of,
// and every field of its body. Values are JSON, and a holon is a reference to it.
//
//   { $ref: id }                 a holon
//   { call: "word", with: [ … ] } a kernel act given its arguments
//   { fn: e }                    a function, its arguments within as { arg: i }
//   { arg: i }                   what a function was given
//   { list: [ … ] }              a list, each of its parts worked out
//   { record: { k: … } }         a record, each of its values worked out
//   a string, number, boolean or null stands for itself
//
// The acts fall in three costs. Walking from what one holds is cheap: get, out, follow
// stepping out. What needs the whole field is index-backed: all, in, match. The rest
// is working with values one already has.

import type { LogEntry } from "../store/store.ts";
import type { Everything } from "./expression.ts";
import { mouldOf, type Mould } from "./moulds.ts";
import { references } from "./references.ts";

export type Value = null | boolean | number | string | Value[] | { [key: string]: Value };
export type Expr = unknown;

type Fn = { fn: Expr; env: Value[] };
type Ref = { $ref: string };

export type Context = { all: Everything; logs?: ReadonlyMap<string, LogEntry[]> };

const isRef = (value: unknown): value is Ref =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as Ref).$ref === "string";
const isFn = (value: unknown): value is Fn => typeof value === "object" && value !== null && "fn" in value;
const ref = (id: string): Ref => ({ $ref: id });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const list = (value: unknown): Value[] =>
  Array.isArray(value) ? value : value === null ? [] : [value as Value];

// A body's values as kernel values: a reference becomes the holon it names, and what
// glass marks with $ is the store's, not the holon's.
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

export function kernel(context: Context) {
  const { known } = context.all;

  const holonOf = (value: unknown) => {
    if (!isRef(value)) throw new Error(`not a holon: ${JSON.stringify(value)?.slice(0, 80)}`);
    return known.get(value.$ref)?.holon;
  };

  const mouldIn = (instance: string[]) =>
    mouldOf(instance.map((type) => known.get(type)?.holon.mould as Mould | undefined));

  // Edges out of a holon: every reference in its body, and what it is an instance of.
  const edgesOut = (id: string) => {
    const holon = known.get(id)?.holon;
    if (!holon) return [];

    return [
      ...holon.instance.map((type) => ({ key: "instance", to: type, holds: false })),
      ...references(holon.body, mouldIn(holon.instance)).map(({ id: to, key, holds }) => ({
        key,
        to,
        holds,
      })),
    ];
  };

  // Edges into a holon, the one thing a holon cannot say of itself: the index.
  let inbound: Map<string, { key: string; from: string; holds: boolean }[]> | undefined;
  const edgesIn = (id: string) => {
    if (!inbound) {
      inbound = new Map();
      for (const from of known.keys())
        for (const { key, to, holds } of edgesOut(from)) {
          const into = inbound.get(to) ?? [];
          into.push({ key, from, holds });
          inbound.set(to, into);
        }
    }
    return inbound.get(id) ?? [];
  };

  // What may be said of a holon as text: its name and its own strings.
  const says = (id: string) => {
    const holon = known.get(id)?.holon;
    const strings: string[] = holon?.name ? [holon.name] : [];
    const walk = (value: unknown, key?: string): void => {
      if (key?.startsWith("$")) return;
      if (typeof value === "string") strings.push(value);
      else if (Array.isArray(value)) value.forEach((each) => walk(each));
      else if (typeof value === "object" && value !== null)
        for (const [inner, held] of Object.entries(value)) walk(held, inner);
    };
    walk(holon?.body);
    return strings.join(" ").toLocaleLowerCase();
  };

  const words = (text: unknown) => String(text).toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const contains = (text: unknown, wanted: unknown) => {
    const said = String(text ?? "").toLocaleLowerCase();
    return words(wanted).every((word) => said.includes(word));
  };

  function apply(fn: unknown, given: Value[]): Value {
    if (!isFn(fn)) throw new Error("not a function");
    return evaluate(fn.fn, given);
  }

  const acts: Record<string, (given: Value[]) => Value> = {
    // Index-backed: what needs the whole field.
    all: () => [...known.keys()].map(ref),
    in: ([holon]) =>
      edgesIn(holonOf(holon)!.id).map(({ key, from, holds }) => ({ key, from: ref(from), holds })),
    match: ([wanted]) =>
      [...known.keys()]
        .filter(
          (id) =>
            !["word", "lexeme", "sentence"].some((t) =>
              known.get(id)!.holon.instance.some((i) => known.get(i)?.holon.name === t),
            ),
        )
        .filter((id) => contains(says(id), wanted))
        .map(ref),
    log: ([store]) =>
      (context.logs?.get(String(store)) ?? []).map(({ at, says, hash }) => ({ at, says, hash })),

    // Walking from what one holds.
    get([value, key]) {
      if (isRef(value)) {
        const holon = holonOf(value);
        if (!holon) return null;
        const own: Record<string, Value> = {
          id: holon.id,
          name: holon.name ?? null,
          store: known.get(holon.id)!.store,
          instance: holon.instance.map(ref),
          mould: (holon.mould as Value) ?? null,
        };
        return String(key) in own ? own[String(key)]! : valueOf(holon.body[String(key)]);
      }
      if (typeof value === "object" && value !== null && !Array.isArray(value))
        return value[key as string] ?? null;
      return null;
    },
    out: ([holon]) => edgesOut(holonOf(holon)!.id).map(({ key, to, holds }) => ({ key, to: ref(to), holds })),

    // The walk: a step applied from what was reached, until nothing new is reached, or a
    // depth, or what the stop says; it yields the edges it walked, so a line, a branch
    // and a join can all be drawn from it.
    follow([seeds, step, stop]) {
      const depthAt = (stop as Record<string, Value> | null)?.depth;
      const until = (stop as Record<string, Value> | null)?.until;
      const seen = new Set(list(seeds).map((seed) => (seed as Ref).$ref));
      const walked: Value[] = [];
      let frontier = [...seen];

      for (let depth = 1; frontier.length && (typeof depthAt !== "number" || depth <= depthAt); depth++) {
        const next: string[] = [];

        for (const from of frontier) {
          if (until && depth > 1 && apply(until, [ref(from)])) continue;

          for (const reached of list(apply(step, [ref(from)]))) {
            const to = isRef(reached) ? reached.$ref : ((reached as Record<string, Value>).to as Ref).$ref;
            const key = isRef(reached) ? null : ((reached as Record<string, Value>).key ?? null);

            walked.push({ from: ref(from), to: ref(to), key, depth });
            if (!seen.has(to)) {
              seen.add(to);
              next.push(to);
            }
          }
        }
        frontier = next;
      }
      return walked;
    },

    // Working with values.
    map: ([items, fn]) => list(items).map((item) => apply(fn, [item])),
    filter: ([items, fn]) => list(items).filter((item) => apply(fn, [item]) === true),
    fold: ([items, start, fn]) =>
      list(items).reduce<Value>((acc, item) => apply(fn, [acc, item]), start ?? null),
    sort: ([items, fn]) =>
      [...list(items)].sort((a, b) => {
        const [x, y] = [apply(fn, [a]), apply(fn, [b])] as [any, any];
        return x < y ? -1 : x > y ? 1 : 0;
      }),
    reverse: ([items]) => [...list(items)].reverse(),
    take: ([items, n]) => list(items).slice(0, Number(n)),
    skip: ([items, n]) => list(items).slice(Number(n)),
    first: ([items]) => list(items)[0] ?? null,
    size: ([items]) => list(items).length,
    has: ([items, item]) => list(items).some((each) => same(each, item)),
    distinct: ([items]) =>
      list(items).filter((item, i, all) => all.findIndex((each) => same(each, item)) === i),
    union: (sets) =>
      sets.flatMap(list).filter((item, i, all) => all.findIndex((each) => same(each, item)) === i),
    common: ([first, ...rest]) =>
      list(first).filter((item) => rest.every((set) => list(set).some((each) => same(each, item)))),
    minus: ([from, out]) => list(from).filter((item) => !list(out).some((each) => same(each, item))),
    keys: ([record]) => Object.keys((record ?? {}) as object),
    put: ([record, key, value]) => ({ ...((record ?? {}) as object), [String(key)]: value }),
    else: ([value, otherwise]) => value ?? otherwise ?? null,
    eq: ([a, b]) => same(a, b),
    lt: ([a, b]) => (a as any) < (b as any),
    add: ([a, b]) => (typeof a === "string" || typeof b === "string" ? `${a}${b}` : Number(a) + Number(b)),
    mul: ([a, b]) => Number(a) * Number(b),
    and: (given) => given.every((each) => each === true),
    or: (given) => given.some((each) => each === true),
    not: ([value]) => value !== true,
    contains: ([text, wanted]) => contains(text, wanted),
    words: ([text]) => words(text),
    says: ([holon]) => says(holonOf(holon)!.id),
  };

  function evaluate(expr: Expr, env: Value[] = []): Value {
    if (expr === null || typeof expr !== "object") return expr as Value;
    if (Array.isArray(expr)) throw new Error("a list is written { list: [ … ] }");

    const form = expr as Record<string, unknown>;

    if ("$ref" in form) return ref(form.$ref as string);
    if ("arg" in form) return env[form.arg as number] ?? null;
    if ("fn" in form) return { fn: form.fn, env } as unknown as Value;
    if ("list" in form) return (form.list as Expr[]).map((each) => evaluate(each, env));
    if ("record" in form)
      return Object.fromEntries(
        Object.entries(form.record as object).map(([key, each]) => [key, evaluate(each, env)]),
      );
    if ("call" in form) {
      const act = acts[form.call as string];
      if (!act) throw new Error(`no act ${form.call}`);
      return act(((form.with as Expr[]) ?? []).map((each) => evaluate(each, env)));
    }

    throw new Error(`not an expression: ${JSON.stringify(expr).slice(0, 80)}`);
  }

  return { evaluate, acts: Object.keys(acts) };
}
