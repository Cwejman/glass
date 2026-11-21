// Taking an act. Into the history go its part, the holons this store keeps of it, as
// partOf in ../act.ts writes them, so its name is the hash the act names for this store;
// and its commit, over the latest. Into the index goes its run: its entries for every
// tree, only what changed, each fact the old versions said that the new ones do not taken
// out, and each fact only the new ones say put in, and the act itself, by its content
// hash. The run follows from the history alone, so the index can trail the commits and be
// written by whoever catches it up.

import { byId, lineOf, partOf } from "../act.ts";
import type { Act, Holon } from "../store.ts";
import { entriesOf, factChanges, heldBy, keyOf, type Change, type Changes, type Tree } from "./entries.ts";
import { commitAt, commitBytes, type View } from "./head.ts";
import { holonAt, wholesOf } from "./read.ts";
import { runOf, type Run } from "./run.ts";
import type { Storage, Storages } from "./storage/storage.ts";

const encoder = new TextEncoder();

// What an act's run is worked out from: what its commit and its part keep of it. born
// only spares looking for versions before, so an act read back from history names none.
export type Indexed = Pick<Act, "hash" | "own" | "parts" | "holons" | "gone" | "born">;

// Writes the act's part into the history, and gives its name, or null where the store
// keeps none of the act's holons.
export async function writePart(history: Storage, act: Act) {
  const part = partOf(act.holons);
  return part && history.put(part);
}

// Writes the act's run into the index, against the store as of a view, and gives the run.
export async function writeRun(storages: Storages, view: View | null, act: Indexed): Promise<Run> {
  // The versions before, of the holons the act writes and lets go, except those this
  // store has never kept.
  const before = new Map<string, Holon | null>();
  const born = new Set(act.born);
  for (const id of [...act.holons.map((holon) => holon.id), ...act.gone])
    before.set(id, born.has(id) ? null : ((await holonAt(storages, view, id))?.version ?? null));

  // Where each holon lies in the part.
  const part = act.parts.find(([store]) => store === act.own)?.[1] ?? null;
  const places = new Map<string, [number, number]>();
  let offset = 0;
  for (const holon of [...act.holons].sort(byId)) {
    const length = encoder.encode(lineOf(holon)).length;
    places.set(holon.id, [offset, length]);
    offset += length + 1;
  }

  const changes = changesMap();
  changes.add({ acts: [[keyOf([act.hash]), true]] });

  for (const holon of act.holons) {
    changes.add({ ids: [[keyOf([holon.id]), [part, ...places.get(holon.id)!]]] });
    changes.add(factChanges(before.get(holon.id) ?? null, holon));
  }

  for (const id of act.gone) {
    const old = before.get(id);
    if (!old) continue;
    changes.add({ ids: [[keyOf([id]), null]] });
    changes.add(factChanges(old, null));
  }

  changes.add(await addressChanges(storages, view, act, before));

  const run = runOf(entriesOf(changes.gathered()));
  return { blob: await storages.index.put(run.bytes), count: run.count, index: run.index };
}

// The bytes of an act's commit over the latest: the act whole, this store's name for
// itself, the latest commit before it, and the number after the latest's.
export async function commitOver(history: Storage, latest: string | null, act: Act) {
  const before = latest === null ? null : await commitAt(history, latest);
  const { when, says, by, at: seen, gone, parts } = act;

  return commitBytes({
    act: by === undefined ? { when, says, at: seen, gone, parts } : { when, says, by, at: seen, gone, parts },
    own: act.own,
    predecessors: latest ? [latest] : [],
    number: (before?.number ?? 0) + 1,
  });
}

// The addresses an act places and takes away: only what changed. A whole it writes gives
// an address to each named holon it now holds and did not before, and takes it from each
// it no longer holds; the parts it held before and still holds keep theirs. A holon it
// renames or lets go moves within, or out of, every whole that held it and still does.
async function addressChanges(
  storages: Storages,
  view: View | null,
  act: Indexed,
  before: Map<string, Holon | null>,
): Promise<Changes> {
  const written = new Map(act.holons.map((holon) => [holon.id, holon]));
  const gone = new Set(act.gone);
  const addresses: Change[] = [];

  const nameAt = async (id: string, now: boolean) => {
    if (now && written.has(id)) return written.get(id)!.name;
    if (now && gone.has(id)) return undefined;
    if (before.has(id)) return before.get(id)?.name;
    return (await holonAt(storages, view, id))?.version.name;
  };

  const wholes = [...written.values(), ...[...gone].map((id) => before.get(id)).filter(Boolean)] as Holon[];
  for (const whole of wholes) {
    const old = before.get(whole.id);
    const held = new Set(old ? heldBy(old) : []);
    const holds = new Set(gone.has(whole.id) ? [] : heldBy(whole));

    for (const child of held) {
      if (holds.has(child)) continue;
      const name = await nameAt(child, false);
      if (name !== undefined) addresses.push([keyOf([whole.id, name]), null]);
    }

    for (const child of holds) {
      if (held.has(child)) continue;
      const name = await nameAt(child, true);
      if (name !== undefined) addresses.push([keyOf([whole.id, name]), child]);
    }
  }

  for (const id of [...written.keys(), ...gone]) {
    const [was, is] = [before.get(id)?.name, gone.has(id) ? undefined : written.get(id)?.name];
    if (was === is || !view) continue;

    for (const whole of await wholesOf(storages, view, id)) {
      if (gone.has(whole)) continue;
      if (written.has(whole) && !heldBy(written.get(whole)!).includes(id)) continue;
      if (was !== undefined) addresses.push([keyOf([whole, was]), null]);
      if (is !== undefined) addresses.push([keyOf([whole, is]), id]);
    }
  }

  return { addresses };
}

// Changes gathered tree by tree, a later change to a key replacing an earlier one.
function changesMap() {
  const byTree = new Map<Tree, Map<string, unknown>>();

  function add(changes: Changes) {
    for (const [tree, list] of Object.entries(changes) as [Tree, Change[]][]) {
      const keys = byTree.get(tree) ?? new Map();
      byTree.set(tree, keys);
      for (const [key, value] of list) {
        keys.delete(key);
        keys.set(key, value);
      }
    }
  }

  function gathered(): Changes {
    return Object.fromEntries([...byTree].map(([tree, keys]) => [tree, [...keys]]));
  }

  return { add, gathered };
}
