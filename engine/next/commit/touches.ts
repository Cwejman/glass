// What a change touches, known from the change alone before anything is read: the
// holons it writes or takes out, and the addresses it places, a whole and a name, where
// a holon of the change refers to a named holon of the change. Two changes meet only
// where these overlap, and only changes that meet wait for each other.
//
// A handle names a holon only within its change, so handles touch nothing. An address a
// change places through a whole it does not write is not seen here; the store answers
// changed if another commit placed it meanwhile, and the change is judged again.

import type { Touches } from "../../../stores/store.ts";
import { references } from "../read/natives/holons.ts";
import { isHandle, type Change } from "./change.ts";

export function touchesOf({ holons, gone = [] }: Change): Touches {
  const named = new Map(
    holons.flatMap((holon) => (holon.name === undefined ? [] : [[holon.id, holon.name] as const])),
  );
  const addresses: Touches["addresses"] = holons.flatMap((holon) =>
    references(holon.body).flatMap(({ id }) =>
      named.has(id) ? [[holon.id, named.get(id)!] as [string, string]] : [],
    ),
  );

  return {
    ids: [...holons.map(({ id }) => id), ...gone].filter((id) => !isHandle(id)),
    addresses: addresses.filter(([whole]) => !isHandle(whole)),
  };
}

// Whether the change brings in a holon nothing in it holds, which goes into the root of
// the store it is put into, and so writes that root. Such changes into one store meet
// there, known from the change before the root is read.
export function placesInRoot({ holons }: Change) {
  const held = new Set(
    holons.flatMap((holon) => references(holon.body).flatMap(({ id, holds }) => (holds ? [id] : []))),
  );
  return holons.some(({ id }) => isHandle(id) && !held.has(id));
}

export function meet(a: Touches, b: Touches) {
  const ids = new Set(a.ids);
  const addresses = new Set(a.addresses.map((address) => JSON.stringify(address)));

  return (
    b.ids.some((id) => ids.has(id)) || b.addresses.some((address) => addresses.has(JSON.stringify(address)))
  );
}
