// A layer: the blob one act is written as. Its first line is the act: its hash, when it
// was made, what it says, what it lets go and touches, and the stores it was offered to
// alongside. Then one line for each holon the act writes, its new version, naming where
// the version before it lies. Its last line is the act's entries for every tree, sorted:
// only what changed, each fact the old versions said that the new ones do not taken
// out, and each fact only the new ones say put in.
//
// A version's pointer into its own layer leaves the layer empty, as a tree's pointers into
// their own segment do; it is resolved when the layer's entries are read.

import type { Act, Head, Holon } from "../store.ts";
import { factChanges, heldBy, type Changes, type Tree } from "./entries.ts";
import { holonAt, wholesOf, type Version } from "./read.ts";
import { rootAt, rootBytes, type Pending, type Root } from "./root.ts";
import type { Storage } from "./storage/storage.ts";
import { keyOf, type Change, type Pointer } from "./tree.ts";

const encoder = new TextEncoder();

// The act's layer, written against the store as of a head, and where its entries lie in it.
export async function layerOf(storage: Storage, at: Head | null, act: Act) {
  const root = at && (await rootAt(storage, at.page));
  const before = new Map<string, Version | null>();
  const lying = new Map<string, Pointer>();
  const changes = changesMap();

  for (const id of [...act.holons.map((holon) => holon.id), ...act.gone]) {
    const held = root && (await holonAt(storage, root, id));
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
  let offset = encoder.encode(header).length + 1;

  for (const holon of act.holons) {
    const old = before.get(holon.id);
    const line = JSON.stringify({ ...holon, prev: lying.get(holon.id) ?? null });
    const length = encoder.encode(line).length;

    changes.add({ ids: [[keyOf([holon.id]), ["", offset, length]]] });
    changes.add(factChanges(old ?? null, holon));

    lines.push(line);
    offset += length + 1;
  }

  for (const id of act.gone) {
    const old = before.get(id);
    if (!old) continue;
    changes.add({ ids: [[keyOf([id]), null]] });
    changes.add(factChanges(old, null));
  }

  changes.add(await addressChanges(storage, root, act, before));

  const entries = JSON.stringify(changes.sorted());
  lines.push(entries);

  return {
    bytes: encoder.encode(lines.join("\n")),
    entries: [offset, encoder.encode(entries).length] as [number, number],
  };
}

// The root that lays a layer over a head: the trees as they were, and the layer added to
// those not yet merged.
export async function rootOver(storage: Storage, at: Head | null, pending: Pending, act: Act) {
  const before: Root | null = at && (await rootAt(storage, at.page));

  return rootBytes({
    act: act.hash,
    at: act.at,
    says: act.says,
    touches: act.touches,
    previous: at?.page ?? null,
    trees: before?.trees ?? {},
    pending: [...(before?.pending ?? []), pending],
  });
}

// The addresses an act places and takes away. A whole it writes is given an address for
// each named holon it holds, and loses those of the holons it held before. A holon it
// renames or lets go moves in, or out of, every whole that holds it and that the act does
// not write.
async function addressChanges(
  storage: Storage,
  root: Root | null,
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
    return root ? (await holonAt(storage, root, id))?.version.name : undefined;
  };

  const wholes = [...written.values(), ...[...gone].map((id) => before.get(id)).filter(Boolean)] as Holon[];
  for (const whole of wholes) {
    const old = before.get(whole.id);
    for (const child of old ? heldBy(old) : []) {
      const name = await nameAt(child, false);
      if (name !== undefined) addresses.push([keyOf([whole.id, name]), null]);
    }
    if (gone.has(whole.id)) continue;
    for (const child of heldBy(whole)) {
      const name = await nameAt(child, true);
      if (name !== undefined) addresses.push([keyOf([whole.id, name]), child]);
    }
  }

  for (const id of [...written.keys(), ...gone]) {
    const [was, is] = [before.get(id)?.name, gone.has(id) ? undefined : written.get(id)?.name];
    if (was === is || !root) continue;

    for (const whole of await wholesOf(storage, root, id)) {
      if (written.has(whole) || gone.has(whole)) continue;
      if (was !== undefined) addresses.push([keyOf([whole, was]), null]);
      if (is !== undefined) addresses.push([keyOf([whole, is]), id]);
    }
  }

  return { addresses };
}

// Changes gathered tree by tree, a later change to a key replacing an earlier one.
function changesMap() {
  const all = new Map<Tree, Map<string, unknown>>();

  function add(changes: Changes) {
    for (const [tree, list] of Object.entries(changes) as [Tree, Change[]][]) {
      const keys = all.get(tree) ?? new Map();
      all.set(tree, keys);
      for (const [key, value] of list) {
        keys.delete(key);
        keys.set(key, value);
      }
    }
  }

  function sorted(): Changes {
    return Object.fromEntries(
      [...all].map(([tree, keys]) => [tree, [...keys].sort(([a], [b]) => (a < b ? -1 : 1))]),
    );
  }

  return { add, sorted };
}
