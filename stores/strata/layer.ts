// A layer: the blob one act's versions are written as. Its first line is the act: its
// hash, when it was made, what it says, what it lets go and touches, and the stores it
// was offered to alongside. Then one line for each holon the act writes, its new version,
// naming where the version before it lies.
//
// Beside the layer, the act's own run: its entries for every tree, only what changed,
// each fact the old versions said that the new ones do not taken out, and each fact only
// the new ones say put in.

import type { Act, Head, Holon } from "../store.ts";
import { entriesOf, factChanges, heldBy, keyOf, type Change, type Changes, type Tree } from "./entries.ts";
import { holonAt, wholesOf, type Version } from "./read.ts";
import { rootAt, rootBytes, type Root, type View } from "./root.ts";
import { runOf, type Run } from "./run.ts";
import type { Storage } from "./storage/storage.ts";

const encoder = new TextEncoder();

// Writes the act's layer and its run, against the store as of a view, and gives the run.
export async function writeLayer(storage: Storage, view: View | null, act: Act): Promise<Run> {
  const before = new Map<string, Version | null>();
  const lying = new Map<string, [string, number, number]>();

  for (const id of [...act.holons.map((holon) => holon.id), ...act.gone]) {
    const held = await holonAt(storage, view, id);
    before.set(id, held?.version ?? null);
    if (held) lying.set(id, held.pointer);
  }

  const header = JSON.stringify({
    hash: act.hash,
    at: act.at,
    says: act.says,
    gone: act.gone,
    touches: act.touches,
    alongside: act.alongside,
  });
  const lines = [header];
  const places = new Map<string, [number, number]>();
  let offset = encoder.encode(header).length + 1;

  for (const holon of act.holons) {
    const line = JSON.stringify({ ...holon, prev: lying.get(holon.id) ?? null });
    const length = encoder.encode(line).length;
    places.set(holon.id, [offset, length]);
    lines.push(line);
    offset += length + 1;
  }

  const layer = await storage.put(encoder.encode(lines.join("\n")));
  const changes = changesMap();

  for (const holon of act.holons) {
    changes.add({ ids: [[keyOf([holon.id]), [layer, ...places.get(holon.id)!]]] });
    changes.add(factChanges(before.get(holon.id) ?? null, holon));
  }

  for (const id of act.gone) {
    const old = before.get(id);
    if (!old) continue;
    changes.add({ ids: [[keyOf([id]), null]] });
    changes.add(factChanges(old, null));
  }

  changes.add(await addressChanges(storage, view, act, before));

  const run = runOf(entriesOf(changes.gathered()));
  return { blob: await storage.put(run.bytes), count: run.count, index: run.index };
}

// The root that lays an act's run over a head: the act, numbered after the head's, and
// the run added, newest, to the runs the head has.
export async function rootOver(storage: Storage, at: Head | null, run: Run, act: Act) {
  const before: Root | null = at && (await rootAt(storage, at.page));
  const number = (before?.number ?? 0) + 1;

  return rootBytes({
    act: act.hash,
    number,
    at: act.at,
    says: act.says,
    touches: act.touches,
    previous: at?.page ?? null,
    runs: [{ ...run, act: number }, ...(before?.runs ?? [])],
  });
}

// The addresses an act places and takes away: only what changed. A whole it writes gives
// an address to each named holon it now holds and did not before, and takes it from each
// it no longer holds; the parts it held before and still holds keep theirs. A holon it
// renames or lets go moves within, or out of, every whole that held it and still does.
async function addressChanges(
  storage: Storage,
  view: View | null,
  act: Act,
  before: Map<string, Version | null>,
): Promise<Changes> {
  const written = new Map(act.holons.map((holon) => [holon.id, holon]));
  const gone = new Set(act.gone);
  const addresses: Change[] = [];

  const nameAt = async (id: string, now: boolean) => {
    if (now && written.has(id)) return written.get(id)!.name;
    if (now && gone.has(id)) return undefined;
    if (before.has(id)) return before.get(id)?.name;
    return (await holonAt(storage, view, id))?.version.name;
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

    for (const whole of await wholesOf(storage, view, id)) {
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
