// And, or and not are one lattice: over truths, the first false, the first true, the
// opposite; over sets of holons, their meet, their join, and everything else the field
// holds. A set is a holon or a list of holons, the empty list the empty set, and what a
// set gives comes in the field's order.

import { isRef, ref, type Value } from "../../language/expression.ts";
import type { Calling, Lazy } from "./natives.ts";
import { list, truly } from "./values.ts";

const isSet = (value: unknown) => isRef(value) || (Array.isArray(value) && value.every(isRef));
const idsOf = (value: unknown) => new Set(list(value).flatMap((each) => (isRef(each) ? [each.$ref] : [])));

export function sets({ world }: Calling): Record<string, Lazy> {
  // The holons a test keeps, in the field's order.
  const keep = (test: (id: string) => boolean): Value[] => [...world.known.keys()].filter(test).map(ref);

  return {
    and(given) {
      let last: Value = true;
      const meet: Set<string>[] = [];

      for (const each of given) {
        last = each();
        if (isSet(last)) meet.push(idsOf(last));
        else if (!truly(last)) return last;
      }

      if (!meet.length) return last;
      const [smallest, ...rest] = meet.sort((a, b) => a.size - b.size);
      return inOrder(
        world.place,
        [...smallest!].filter((id) => rest.every((set) => set.has(id))),
      );
    },

    or(given) {
      const join = new Set<string>();
      let anySet = false;

      for (const each of given) {
        const value = each();
        if (isSet(value)) {
          anySet = true;
          for (const id of idsOf(value)) join.add(id);
        } else if (truly(value)) return value;
      }

      return anySet ? inOrder(world.place, [...join]) : false;
    },

    not([given]) {
      const value = given?.() ?? null;
      if (!isSet(value)) return !truly(value);

      const out = idsOf(value);
      return keep((id) => !out.has(id));
    },
  };
}

// Holons in the field's order, those the field does not hold let go.
export const inOrder = (place: ReadonlyMap<string, number>, ids: Iterable<string>): Value[] =>
  [...ids]
    .filter((id) => place.has(id))
    .sort((a, b) => place.get(a)! - place.get(b)!)
    .map(ref);
