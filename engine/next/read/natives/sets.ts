// And, or and not are one lattice: over truths, the first false, the first true, the
// opposite; over sets of holons, their meet and their join. A set is a holon or a list of
// holons, the empty list the empty set, and what a set gives comes in the order its
// holons were born, which their ids sort in.
//
// Not over a set would be every other holon of the field, which no store is asked for,
// so it is refused.

import { isRef, list, ref, truly, type Value } from "../values.ts";
import { after, each } from "../maybe.ts";
import type { Lazy } from "./natives.ts";

const isSet = (value: unknown) => isRef(value) || (Array.isArray(value) && value.every(isRef));
const idsOf = (value: unknown) => new Set(list(value).flatMap((each) => (isRef(each) ? [each.$ref] : [])));

// Holons in the order they were born.
export const inOrder = (ids: Iterable<string>): Value[] => [...ids].sort().map(ref);

export function sets(): Record<string, Lazy> {
  return {
    // The first false of truths, else the last; the meet of the sets among them.
    and(given) {
      const meet: Set<string>[] = [];
      let failed: Value | undefined;

      return after(
        each(given, true as Value, (last, next) => {
          if (failed !== undefined) return last;
          return after(next(), (value) => {
            if (isSet(value)) meet.push(idsOf(value));
            else if (!truly(value)) failed = value;
            return value;
          });
        }),
        (last) => {
          if (failed !== undefined) return failed;
          if (!meet.length) return last;
          const [smallest, ...rest] = meet.sort((a, b) => a.size - b.size);
          return inOrder([...smallest!].filter((id) => rest.every((set) => set.has(id))));
        },
      );
    },

    // The first true of truths; the join of the sets among them.
    or(given) {
      const join = new Set<string>();
      let anySet = false;
      let found: Value | undefined;

      return after(
        each(given, null as Value, (last, next) => {
          if (found !== undefined) return last;
          return after(next(), (value) => {
            if (isSet(value)) {
              anySet = true;
              for (const id of idsOf(value)) join.add(id);
            } else if (truly(value)) found = value;
            return value;
          });
        }),
        () => (found !== undefined ? found : anySet ? inOrder(join) : false),
      );
    },

    not: ([given]) =>
      after(given?.() ?? null, (value) => {
        if (isSet(value))
          throw new Error("not of a set is every other holon of the field, which is not read");
        return !truly(value);
      }),
  };
}
