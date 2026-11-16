// And, or and not are one lattice: over truths, the first false, the first true, the
// opposite; over sets of holons, their meet and their join. A set is a holon or a list of
// holons, the empty list the empty set, and what a set gives comes in the order its
// holons were born, which their ids sort in.
//
// Not over a set would be every other holon of the field, which no store is asked for,
// so it is refused.

import { isRef, ref, type Value } from "../../../../language/expression.ts";
import type { Lazy } from "./natives.ts";
import { list, truly } from "../values.ts";

const isSet = (value: unknown) => isRef(value) || (Array.isArray(value) && value.every(isRef));
const idsOf = (value: unknown) => new Set(list(value).flatMap((each) => (isRef(each) ? [each.$ref] : [])));

// Holons in the order they were born.
export const inOrder = (ids: Iterable<string>): Value[] => [...ids].sort().map(ref);

export function sets(): Record<string, Lazy> {
  return {
    async and(given) {
      let last: Value = true;
      const meet: Set<string>[] = [];

      for (const each of given) {
        last = await each();
        if (isSet(last)) meet.push(idsOf(last));
        else if (!truly(last)) return last;
      }

      if (!meet.length) return last;
      const [smallest, ...rest] = meet.sort((a, b) => a.size - b.size);
      return inOrder([...smallest!].filter((id) => rest.every((set) => set.has(id))));
    },

    async or(given) {
      const join = new Set<string>();
      let anySet = false;

      for (const each of given) {
        const value = await each();
        if (isSet(value)) {
          anySet = true;
          for (const id of idsOf(value)) join.add(id);
        } else if (truly(value)) return value;
      }

      return anySet ? inOrder(join) : false;
    },

    async not([given]) {
      const value = (await given?.()) ?? null;
      if (isSet(value)) throw new Error("not of a set is every other holon of the field, which is not read");
      return !truly(value);
    },
  };
}
