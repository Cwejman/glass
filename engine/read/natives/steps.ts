// The steps of a read: its pipe chain, `a | f(b) | g`, as reads of their own. steps
// takes a read apart into them, and chain joins them again; each is the other's reverse,
// a pair, so chain(steps(r)) reads as r does.
//
// A step is what one use adds to the step before it: the first step is what the chain
// begins with, and each after it a use carried by the read, its first argument, what was
// piped into it, left out, so f(a, b) gives the step f(b). Every step carries the read's
// holons, its own use in its place, so each is said as text by print as it is.
//
// Nothing, null, the read of a blank text, has no steps, and no steps chain to nothing.
// What is not a read gives null; a read that is no use of a carried use is one step.

import type { Holon } from "../../../stores/store.ts";
import { isRecord, isRef, list, type Rec, type Value } from "../values.ts";
import type { Native } from "./natives.ts";

type Read = { gives: Value; holons: Holon[] };

export const steps: Record<string, Native> = {
  steps([given]) {
    if (given === null) return [];
    if (!isRead(given)) return null;
    const read = given as Rec;

    const holons = carriedBy(read);
    const byId = new Map(holons.map((holon) => [holon.id, holon]));

    function stepsOf(gives: Value): Read[] {
      const use = usedAt(gives, byId);
      if (!use || !use.args.length) return [{ gives, holons }];

      const step = { ...use.holon, body: { ...use.holon.body, args: use.args.slice(1) } };
      return [
        ...stepsOf(use.args[0]!),
        { gives, holons: holons.map((holon) => (holon.id === step.id ? step : holon)) },
      ];
    }

    return stepsOf(read.gives ?? null) as unknown as Value;
  },

  chain([given]) {
    const reads = list(given);
    if (!reads.length || !reads.every(isRead)) return null;

    // Every holon the steps carry, as the first step carries it, then each later step's
    // own use given what came before it.
    const [first, ...rest] = reads as Rec[];
    const byId = new Map(
      reads.toReversed().flatMap((read) => carriedBy(read as Rec).map((holon) => [holon.id, holon])),
    );
    let gives = first!.gives ?? null;

    for (const read of rest) {
      const use = usedAt(read.gives ?? null, new Map(carriedBy(read).map((holon) => [holon.id, holon])));
      if (!use) return null;

      byId.set(use.holon.id, { ...use.holon, body: { ...use.holon.body, args: [gives, ...use.args] } });
      gives = read.gives ?? null;
    }

    return { gives, holons: reachedFrom(gives, byId) } as unknown as Value;
  },
};

const isRead = (value: unknown): value is Rec => isRecord(value) && "gives" in value;

const carriedBy = (read: Rec) => (Array.isArray(read.holons) ? read.holons : []) as unknown as Holon[];

// The use a read carries where a value refers to one held there, and what it is given.
function usedAt(gives: Value, byId: ReadonlyMap<string, Holon>) {
  const holon = isRef(gives) && (gives as { $holds?: boolean }).$holds ? byId.get(gives.$ref) : undefined;
  const { fn, args } = holon?.body ?? {};
  return holon && isRef(fn) && Array.isArray(args) ? { holon, args: args as Value[] } : undefined;
}

// The holons a value refers to among those carried, and those they refer to in turn.
function reachedFrom(gives: Value, byId: ReadonlyMap<string, Holon>): Holon[] {
  const reached = new Map<string, Holon>();

  const walk = (value: unknown): void => {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(walk);
    if (!isRef(value)) return Object.values(value).forEach(walk);

    const holon = byId.get(value.$ref);
    if (!holon || reached.has(holon.id)) return;
    reached.set(holon.id, holon);
    walk(holon.body);
  };

  walk(gives);
  return [...reached.values()];
}
