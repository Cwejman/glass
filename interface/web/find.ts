// Finding a component for a value that names none: a use drawn with no function, or any
// value given to be drawn. The candidates are the components realized here whose first
// required placeholder accepts the value, held to it by the same fits a read binds by,
// but those drawn only where a use names them; those of a type come before the
// fallback, which draws anything. The first that fits is drawn: a pick is not yet
// written, nor is a choice between several shown.
//
// What fitting needs of the field, each component's input and the holons a value refers
// to with their types, is read through the engine, each holon once a page.

import type { Engine } from "../../engine/next/engine.ts";
import { fits, inputOf, kindsAmong, knownAs, placeAs, type Known } from "../../engine/next/read/input.ts";
import { after, all, each, type Maybe } from "../../engine/next/read/maybe.ts";
import { isRecord, ref, type Value } from "../../engine/next/read/values.ts";
import type { Holon } from "../../stores/store.ts";
import { applying, type Glass } from "./carried.ts";

export type Find = (value: Value) => Maybe<string>;

type Candidate = { id: string; types: Holon[] };

export function finder(
  read: Engine["read"],
  glass: Glass,
  components: readonly string[],
  fallback: string,
): Find {
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
  let candidates: Maybe<Candidate[]> | undefined;
  const candidatesNow = () =>
    (candidates ??= after(
      all(
        components
          .filter((id) => id !== fallback)
          .map((id) =>
            after(holonOf(id), (holon) => {
              if (!holon || holon.body.named === true) return null;
              const first = inputOf(holon)?.find((link) => !link.$optional);
              if (!first) return null;
              return after(known(first.$ref), (found) =>
                found ? { id, types: placeAs(first, found).types } : null,
              );
            }),
          ),
      ),
      (found) => (candidates = found.filter((each): each is Candidate => each !== null)),
    ));

  return (value) =>
    after(candidatesNow(), (candidates) => {
      const kinds = kindsAmong(candidates.flatMap(({ types }) => types));
      const given = { written: value, value: () => value };

      return after(
        each(
          candidates,
          null as string | null,
          (found, { id, types }) =>
            found ?? after(fits(types, given, known, kinds), (fit) => (fit ? id : null)),
        ),
        (found) => found ?? fallback,
      );
    });
}

const isHolon = (holon: Holon | null): holon is Holon => holon !== null;

// A holon as the native holon reads it, its store and its types' names set aside.
function asHolon({ id, instance, name, mould, body }: Record<string, unknown>): Holon {
  return {
    id: String(id),
    instance: Array.isArray(instance) ? instance.map(String) : [],
    ...(typeof name === "string" && { name }),
    ...(isRecord(mould) && { mould: mould as Holon["mould"] }),
    body: (isRecord(body) ? body : {}) as Holon["body"],
  };
}
