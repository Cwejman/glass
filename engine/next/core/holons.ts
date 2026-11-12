// The natives that read the field: everything it holds, a holon's own values, what it
// refers to and what refers to it, a walk along such steps, and a holon or a whole as a
// reader is given them. What refers to a holon is the one thing it cannot say of itself,
// so the world keeps it.

import { isRef, ref, type Value } from "../../../language/expression.ts";
import { partsOf, references } from "../moulds.ts";
import type { Calling, Native } from "./natives.ts";
import { isRecord, list, truly, values, type Rec } from "./values.ts";

export function holons({ world, apply }: Calling): Record<string, Native> {
  const holonOf = (value: unknown) => (isRef(value) ? world.known.get(value.$ref)?.holon : undefined);

  // A holon's own values, and then its body's, which never shadow them.
  const own = (value: unknown): Record<string, Value> | undefined => {
    const holon = holonOf(value);
    if (!holon) return undefined;

    return {
      id: holon.id,
      name: holon.name ?? null,
      store: world.known.get(holon.id)!.store,
      instance: holon.instance.map(ref),
      mould: (holon.mould as Value) ?? null,
    };
  };

  // A holon as a reader is given it: its own values, its body, where it is read from,
  // the block of its version, and the names of what it is.
  const reading = (id: string): Value => {
    const kept = world.known.get(id);
    if (!kept) return null;

    const { holon } = kept;
    const types = [
      ...(holon.mould ? ["type"] : []),
      ...holon.instance.flatMap((type) => world.known.get(type)?.holon.name ?? []),
    ];

    return { ...(holon as unknown as Record<string, Value>), store: kept.store, version: kept.block ?? null, types };
  };

  return {
    everything: () => [...world.known.keys()].map(ref),
    attachments: () => [...world.stores],

    get([value, key]) {
      const values = own(value);
      if (values) return String(key) in values ? values[String(key)]! : plain(holonOf(value)!.body[String(key)]);
      if (Array.isArray(value)) return typeof key === "number" ? (value[key] ?? null) : null;
      if (isRecord(value)) return (value as Rec)[String(key)] ?? null;

      return null;
    },

    keys: ([value]) => {
      const holon = holonOf(value);
      return holon ? Object.keys(holon.body) : values.keys!([value]);
    },

    // Edges out of a holon: what it is an instance of, then every reference in its body,
    // in the order the body holds them.
    out([value]) {
      const holon = holonOf(value);
      if (!holon) return [];

      return [
        ...holon.instance.map((type) => ({ key: "instance", to: ref(type), holds: false })),
        ...references(holon.body, world.mouldFor(holon)).map(({ id, key, holds }) => ({ key, to: ref(id), holds })),
      ];
    },

    // Edges into a holon.
    in: ([value]) =>
      isRef(value) ? world.holders(value.$ref).map(({ from, key, holds }) => ({ key, from: ref(from), holds })) : [],

    holon: ([value]) => (isRef(value) ? reading(value.$ref) : null),

    // A whole: a holon and what it holds, down to a depth, entering nothing whose type is
    // named in stop, though reading it.
    whole([value, depth, stop]) {
      if (!isRef(value)) return null;

      const most = typeof depth === "number" ? depth : Number.POSITIVE_INFINITY;
      const stopAt = new Set(list(stop).filter((each) => typeof each === "string"));
      const holons: Record<string, Value> = {};

      for (let layer = [value.$ref], down = 0; layer.length && down <= most; down++) {
        const next: string[] = [];

        for (const id of new Set(layer)) {
          if (holons[id] || !world.known.has(id)) continue;

          const read = reading(id) as { types: string[] };
          holons[id] = read as unknown as Value;

          const holon = world.known.get(id)!.holon;
          const stopped = id !== value.$ref && read.types.some((type) => stopAt.has(type));
          if (!stopped) next.push(...partsOf(holon.body, world.mouldFor(holon)));
        }

        layer = next;
      }

      return { root: value.$ref, holons };
    },

    // A walk: a step taken from what was reached, until nothing new is reached, a depth,
    // or what the stop says; it gives the edges it walked, so a line, a branch and a join
    // can all be drawn from it.
    follow([seeds, step, given]) {
      const stop = (isRecord(given) ? given : {}) as Rec;
      const most = typeof stop.depth === "number" ? stop.depth : undefined;
      const until = stop.until;
      const seen = new Set(list(seeds).flatMap((each) => (isRef(each) ? [each.$ref] : [])));
      const walked: Value[] = [];
      let frontier = [...seen];

      for (let down = 1; frontier.length && (most === undefined || down <= most); down++) {
        const next: string[] = [];

        for (const from of frontier) {
          if (until && down > 1 && truly(apply(until, [ref(from)]))) continue;

          for (const reached of list(apply(step, [ref(from)]))) {
            const edge = isRef(reached) ? { to: reached, key: null } : isRecord(reached) ? reached : {};
            if (!isRef(edge.to)) continue;

            walked.push({ from: ref(from), to: edge.to, key: (edge.key as Value) ?? null, depth: down });
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
  };
}

// A body's value as the language has it: references as holons, and what a body says of
// its own references, under $, left out.
export function plain(value: unknown): Value {
  if (Array.isArray(value)) return value.map(plain);
  if (isRef(value)) return ref(value.$ref);
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !key.startsWith("$"))
        .map(([key, inner]) => [key, plain(inner)]),
    );

  return (value ?? null) as Value;
}
