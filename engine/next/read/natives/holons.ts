// The natives that read holons: a holon's own values, what it refers to and what refers
// to it, a walk along such steps, and a holon or a whole as a reader is given them.
// Whether a reference holds is said by the reference itself, as every store keeps it.
// What refers to a holon is the one thing it cannot say of itself, so the stores are
// asked for it, by the facts that refer to it.

import { isRef, ref, type Value } from "../../../../language/expression.ts";
import type { Holon } from "../../../../stores/store.ts";
import type { Field } from "../field.ts";
import { after } from "../maybe.ts";
import type { Calling, Native } from "./natives.ts";
import { isRecord, list, truly, type Rec } from "../values.ts";
import { values } from "./values.ts";

// A reference in a body, under its top key, and whether it holds.
export type Reference = { id: string; key: string; holds: boolean };

export function holons({ field, apply }: Calling): Record<string, Native> {
  const keptOf = (value: unknown) => (isRef(value) ? field.holon(value.$ref) : null);

  return {
    stores: () => [...field.stores],

    get: ([value, key]) =>
      after(keptOf(value), (kept) => {
        if (kept) {
          const { holon, store } = kept;
          const own: Record<string, Value> = {
            id: holon.id,
            name: holon.name ?? null,
            store,
            instance: holon.instance.map(ref),
            mould: (holon.mould as Value) ?? null,
          };
          return String(key) in own ? own[String(key)]! : asValue(holon.body[String(key)]);
        }

        if (Array.isArray(value)) return typeof key === "number" ? (value[key] ?? null) : null;
        if (isRecord(value)) return (value as Rec)[String(key)] ?? null;
        return null;
      }),

    keys: ([value]) =>
      after(keptOf(value), (kept) => (kept ? Object.keys(kept.holon.body) : values.keys!([value]))),

    // Edges out of a holon: what it is an instance of, then every reference in its body,
    // in the order the body holds them.
    out: ([value]) =>
      after(keptOf(value), (kept) =>
        kept
          ? [
              ...kept.holon.instance.map((type) => ({ key: "instance", to: ref(type), holds: false })),
              ...references(kept.holon.body).map(({ id, key, holds }) => ({ key, to: ref(id), holds })),
            ]
          : [],
      ),

    // Edges into a holon.
    in: async ([value]) =>
      isRef(value)
        ? (await holdersOf(field, value.$ref)).map(({ id, key, holds }) => ({ key, from: ref(id), holds }))
        : [],

    holon: async ([value]) =>
      isRef(value) ? ((await reading(field, value.$ref)) as unknown as Value) : null,

    // A whole: a holon and what it holds, down to a depth, entering nothing whose type is
    // named in stop, though reading it. Each layer is read at once.
    async whole([value, depth, stop]) {
      if (!isRef(value)) return null;

      const most = typeof depth === "number" ? depth : Number.POSITIVE_INFINITY;
      const stopAt = new Set(list(stop).filter((each) => typeof each === "string"));
      const holons: Record<string, Value> = {};

      for (let layer = [value.$ref], down = 0; layer.length && down <= most; down++) {
        const fresh = [...new Set(layer)].filter((id) => !(id in holons));
        const read = await Promise.all(fresh.map((id) => reading(field, id)));
        const next: string[] = [];

        fresh.forEach((id, i) => {
          const each = read[i];
          if (!each) return;

          holons[id] = each as unknown as Value;
          const stopped = id !== value.$ref && each.types.some((type) => stopAt.has(type));
          if (!stopped) next.push(...partsOf(each.body));
        });

        layer = next;
      }

      return { root: value.$ref, holons };
    },

    // A walk: a step taken from what was reached, until nothing new is reached, a depth,
    // or what the stop says; it gives the edges it walked, so a line, a branch and a join
    // can all be drawn from it. Each depth's steps are taken at once.
    async follow([seeds, step, given]) {
      const stop = (isRecord(given) ? given : {}) as Rec;
      const most = typeof stop.depth === "number" ? stop.depth : undefined;
      const until = stop.until;
      const seen = new Set(list(seeds).flatMap((each) => (isRef(each) ? [each.$ref] : [])));
      const walked: Value[] = [];
      let frontier = [...seen];

      for (let down = 1; frontier.length && (most === undefined || down <= most); down++) {
        const stopped = await Promise.all(
          frontier.map(async (from) => Boolean(until && down > 1 && truly(await apply(until, [ref(from)])))),
        );
        const going = frontier.filter((_, i) => !stopped[i]);
        const reached = await Promise.all(going.map((from) => apply(step, [ref(from)])));
        const next: string[] = [];

        going.forEach((from, i) => {
          for (const each of list(reached[i]!)) {
            const edge = isRef(each) ? { to: each, key: null } : isRecord(each) ? each : {};
            if (!isRef(edge.to)) continue;

            walked.push({ from: ref(from), to: edge.to, key: (edge.key as Value) ?? null, depth: down });
            if (!seen.has(edge.to.$ref)) {
              seen.add(edge.to.$ref);
              next.push(edge.to.$ref);
            }
          }
        });

        frontier = next;
      }

      return walked;
    },
  };
}

// A holon as a reader is given it: itself, the store it is read from, and the names of
// what it is, "type" first where it is a type.
export async function reading(field: Field, id: string) {
  const kept = await field.holon(id);
  if (!kept) return null;

  const { holon, store } = kept;
  const types = await Promise.all(holon.instance.map((type) => field.holon(type)));
  const names = [
    ...(holon.mould ? ["type"] : []),
    ...types.flatMap((type) => (type?.holon.name ? [type.holon.name] : [])),
  ];

  return { ...holon, store, types: names };
}

// Every reference in a body, in the order the body holds them, under its top key.
export function references(body: Holon["body"]): Reference[] {
  const found: Reference[] = [];

  function walk(value: unknown, key: string) {
    if (Array.isArray(value)) for (const item of value) walk(item, key);
    else if (isRef(value))
      found.push({ id: value.$ref, key, holds: (value as { $holds?: boolean }).$holds === true });
    else if (typeof value === "object" && value !== null)
      for (const inner of Object.values(value)) walk(inner, key);
  }

  for (const [key, value] of Object.entries(body)) walk(value, key);
  return found;
}

export const partsOf = (body: Holon["body"]) =>
  references(body)
    .filter(({ holds }) => holds)
    .map(({ id }) => id);

// What refers to a holon: from which holon, under which key, and whether it holds it, in
// the order the referring holons were born.
export async function holdersOf(field: Field, id: string): Promise<Reference[]> {
  const facts = await field.facts({ v: { $ref: id } });
  const holding = new Set(facts.filter(({ a }) => a === "$holds").map(({ e }) => e));

  return facts
    .filter(({ a }) => a !== "$holds" && a !== "instance")
    .sort((x, y) => (x.e < y.e ? -1 : x.e > y.e ? 1 : 0))
    .map(({ e, a }) => ({ id: e, key: a, holds: holding.has(e) }));
}

// A body's value as the language has it: references as holons, and what a body says of
// its own references, under $, left out.
export function asValue(value: unknown): Value {
  if (Array.isArray(value)) return value.map(asValue);
  if (isRef(value)) return ref(value.$ref);
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !key.startsWith("$"))
        .map(([key, inner]) => [key, asValue(inner)]),
    );

  return (value ?? null) as Value;
}
