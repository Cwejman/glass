// Finding a component for a value that names none: a use drawn with no function, or any
// value given to be drawn. Finding is by type. The candidates are the components realized
// here whose first required placeholder takes a type of the field, a brief say, and
// accepts the value, held to it by the same fits a read binds by. A kind says only what
// shape a value has, and many components take one shape for different ends, a string
// typed into or a string said, so a component taking only a kind is drawn where a use
// names it, and never found; but for the fallback, the one taking any value, which draws
// what no type finds.
//
// One found by a type is the component found; several are a choice, shown, and nothing
// is guessed; none, and the fallback draws it.
//
// What fitting needs of the field, each component's input and the holons a value refers
// to with their types, is read through the engine, each holon once a page.

import type { Engine } from "../../engine/engine.ts";
import {
  fits,
  inputOf,
  kindsAmong,
  knownAs,
  placeAs,
  type Kinds,
  type Known,
} from "../../engine/read/input.ts";
import { after, all, type Maybe } from "../../engine/read/maybe.ts";
import { isRecord, ref, type Value } from "../../engine/read/values.ts";
import type { Holon } from "../../stores/store.ts";
import { applying, type Glass } from "./carried.ts";

// What finding gives: the one component found by its type, or the fallback where no type
// finds one, or the components among which the value's is to be chosen.
export type Found = { component: string; by: "type" | "fallback" } | { among: string[] };

export type Find = (value: Value) => Maybe<Found>;

type Candidate = { id: string; types: Holon[] };

export function finder(read: Engine["read"], glass: Glass, components: readonly string[]): Find {
  const holons = new Map<string, Maybe<Holon | null>>();
  const holonOf = (id: string): Maybe<Holon | null> => {
    if (!holons.has(id))
      holons.set(
        id,
        read(applying(glass, "holon", ref(id))).then((answer) => {
          const found = "value" in answer && isRecord(answer.value) ? asHolon(answer.value) : null;
          holons.set(id, found);
          return found;
        }),
      );
    return holons.get(id)!;
  };

  const known = (id: string): Maybe<Known | null> =>
    after(holonOf(id), (holon) =>
      holon
        ? after(all(holon.instance.map(holonOf)), (types) => knownAs(holon, types.filter(isHolon)))
        : null,
    );

  // Each component with a required placeholder, and the types its first one takes.
  const candidateOf = (id: string): Maybe<Candidate | null> =>
    after(holonOf(id), (holon) => {
      const first = holon && inputOf(holon)?.find((link) => !link.$optional);
      if (!first) return null;
      return after(known(first.$ref), (found) => (found ? { id, types: placeAs(first, found).types } : null));
    });

  // The candidates found by type, and the fallback, each component once a page.
  let candidates: Maybe<{ typed: Candidate[]; fallback?: string; kinds: Kinds }> | undefined;
  const candidatesNow = () =>
    (candidates ??= after(all(components.map(candidateOf)), (found) => {
      const each = found.filter((candidate): candidate is Candidate => candidate !== null);
      const kinds = kindsAmong(each.flatMap(({ types }) => types));
      const typed = each.filter(({ types }) => types.some((type) => !kinds.has(type.id)));
      const fallback = each.find(
        ({ types }) => types.length > 0 && types.every((type) => kinds.get(type.id) === "value"),
      )?.id;
      return (candidates = { typed, fallback, kinds });
    }));

  return (value) =>
    after(candidatesNow(), ({ typed, fallback, kinds }) => {
      const given = { written: value, value: () => value };
      const fitting = all(typed.map(({ types }) => fits(types, given, known, kinds)));

      return after(fitting, (fit): Found => {
        const among = typed.filter((_, i) => fit[i]).map(({ id }) => id);
        if (among.length === 1) return { component: among[0]!, by: "type" };
        if (among.length > 1) return { among };
        if (!fallback) throw new Error("no component here draws what no type finds");
        return { component: fallback, by: "fallback" };
      });
    });
}

const isHolon = (holon: Holon | null): holon is Holon => holon !== null;

// A holon as the native holon reads it, its store and its types' names set aside.
export function asHolon({ id, instance, name, mould, body }: Record<string, unknown>): Holon {
  return {
    id: String(id),
    instance: Array.isArray(instance) ? instance.map(String) : [],
    ...(typeof name === "string" && { name }),
    ...(isRecord(mould) && { mould: mould as Holon["mould"] }),
    body: (isRecord(body) ? body : {}) as Holon["body"],
  };
}
