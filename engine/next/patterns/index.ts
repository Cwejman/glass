// The index a pattern is answered from: each store's facts, made once and carried from
// field to field. A store nothing changed keeps its index; one a little changed has its
// index patched by what changed; one much changed is indexed afresh.
//
// What changed is told by versions: a holon's block, and for its types the store and
// block of each, so a type changed anywhere re-says the facts of its instances.

import type { Found, World } from "../world.ts";
import { answeringAll, indexOf, patchedIndex, type Answering, type Index } from "./facts.ts";

type Version = string | Found;

export type Indexed = {
  index: Index;
  versions: ReadonlyMap<string, Version>;
  types: ReadonlyMap<string, Version | undefined>;
};

export type Shelf = Map<string, Indexed>;

export type Made = "carried" | "patched" | "fresh";

// The share of a store that may change and still be patched.
const mostPatched = 1 / 4;

// What a store keeps that the field reads from another is indexed here only as residing.
const keptHere = "kept here, read from another store";

export function indexFor(world: World): Answering {
  return answeringAll(world.stores.map((key) => storeIndex(world, key).index));
}

// How each store's index was made for this world, for those who test the carrying.
const made = new WeakMap<World, Map<string, Made>>();
export const howIndexed = (world: World): ReadonlyMap<string, Made> => (world.index(), made.get(world)!);

function storeIndex(world: World, key: string) {
  const shelf = world.shelf;
  const held = world.byStore.get(key) ?? [];
  const before = shelf.get(key);
  const { also, dirty, versions, types } = changesOf(world, held, before);
  const mould = (holon: Found["holon"]) => world.mouldFor(holon);

  const keep = (index: Index, how: Made) => {
    shelf.set(key, { index, versions, types });
    made.set(world, (made.get(world) ?? new Map()).set(key, how));
    return { index, how };
  };

  if (!before) return keep(indexOf(held, mould, also), "fresh");
  if (!dirty.size) return keep(before.index, "carried");

  const patched =
    dirty.size <= Math.max(held.length, before.versions.size) * mostPatched
      ? patchedIndex(before.index, held, also, dirty, mould)
      : undefined;

  return patched ? keep(patched, "patched") : keep(indexOf(held, mould, also), "fresh");
}

function changesOf(world: World, held: readonly Found[], before: Indexed | undefined) {
  const versionOf = (kept: Found): Version => kept.block ?? kept;
  const typeVersionOf = (kept: Found | undefined): Version | undefined =>
    kept && (kept.block === undefined ? kept : `${kept.store}\u0000${kept.block}`);

  const also = new Set<Found>();
  const versions = new Map<string, Version>();
  const types = new Map<string, Version | undefined>();
  const dirty = new Set<string>();
  let stillHeld = 0;

  for (const each of held) {
    const id = each.holon.id;
    const readHere = world.known.get(id) === each;

    if (readHere) {
      for (const type of each.holon.instance)
        if (!types.has(type)) types.set(type, typeVersionOf(world.known.get(type)));
    } else also.add(each);

    const version = readHere ? versionOf(each) : keptHere;
    versions.set(id, version);

    const was = before?.versions.get(id);
    if (was !== undefined) stillHeld++;
    if (was !== version) dirty.add(id);
  }

  if (before) {
    if (stillHeld < before.versions.size)
      for (const id of before.versions.keys()) if (!versions.has(id)) dirty.add(id);

    const changedTypes = new Set(
      [...types].filter(([id, version]) => before.types.get(id) !== version).map(([id]) => id),
    );
    if (changedTypes.size)
      for (const each of held)
        if (!also.has(each) && each.holon.instance.some((type) => changedTypes.has(type)))
          dirty.add(each.holon.id);
  }

  return { also, dirty, versions, types };
}
