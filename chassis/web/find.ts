// Finding a component for what a use naming none gives: the components realized here
// that fitting, a function written in the language, says take it, as a use giving it
// would be bound and by a type of the field. One found is the component found; several
// are a choice, shown, and nothing is guessed; none, and the fallback draws it.

import type { Engine } from "../../engine/engine.ts";
import type { Maybe } from "../../engine/read/maybe.ts";
import { isRef, ref, type Value } from "../../engine/read/values.ts";
import { applying, type Glass } from "../../language/shipped.ts";

// What finding gives: the one component found by its type, or the fallback where no type
// finds one, or the components among which the one drawing it is to be chosen.
export type Found = { component: string; by: "type" | "fallback" } | { among: string[] };

export type Find = (given: Value[]) => Maybe<Found>;

export function finder(
  read: Engine["read"],
  glass: Glass,
  components: readonly string[],
  fallback: string,
): Find {
  const byFallback: Found = { component: fallback, by: "fallback" };

  // Only a holon is of a type of the field, so what holds none is drawn by the fallback
  // at once, nothing read.
  return (given) => {
    if (!given.some(isRef)) return byFallback;
    return read(applying(glass, "fitting", given, components.map(ref))).then((answer): Found => {
      if (!("value" in answer)) throw new Error(answer.problem);
      const among = (Array.isArray(answer.value) ? answer.value : []).filter(isRef).map(({ $ref }) => $ref);
      if (among.length === 1) return { component: among[0]!, by: "type" };
      if (among.length > 1) return { among };
      return byFallback;
    });
  };
}
