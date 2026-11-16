// Taking an act. Its part is written first: the holons this store keeps of it, as
// partOf in ../act.ts writes them, so its name is the hash the act names for this store.
// Then its run: its entries for every tree, only what changed, each fact the old
// versions said that the new ones do not taken out, and each fact only the new ones say
// put in, and the act itself, by its content hash. Last its commit, over the head it is
// laid on.

import { byId, lineOf } from "../act.ts";
import type { Act, Holon } from "../store.ts";
import { entriesOf, factChanges, heldBy, keyOf, type Change, type Changes, type Tree } from "./entries.ts";
import { commitAt, commitBytes, type State, type View } from "./head.ts";
import { holonAt, wholesOf } from "./read.ts";
import { runOf, type Run } from "./run.ts";
import type { Storage } from "./storage/storage.ts";

const encoder = new TextEncoder();

// Writes the act's part and its run, against the store as of a view, and gives the run.
export async function writeAct(storage: Storage, view: View | null, act: Act): Promise<Run> {
  // The versions before, of the holons the act writes and lets go, except those this
  // store has never kept.
  const before = new Map<string, Holon | null>();
  const born = new Set(act.born);
  for (const id of [...act.holons.map((holon) => holon.id), ...act.gone])
    before.set(id, born.has(id) ? null : ((await holonAt(storage, view, id))?.version ?? null));

  const lines: string[] = [];
  const places = new Map<string, [number, number]>();
  let offset = 0;
  for (const holon of [...act.holons].sort(byId)) {
    const line = lineOf(holon);
    const length = encoder.encode(line).length;
    lines.push(line);
    places.set(holon.id, [offset, length]);
    offset += length + 1;
  }
  const part = lines.length ? await storage.put(encoder.encode(lines.join("\n"))) : null;

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

  changes.add(await addressChanges(storage, view, act, before));

  const run = runOf(entriesOf(changes.gathered()));
  return { blob: await storage.put(run.bytes), count: run.count, index: run.index };
}

// The commit of an act laid over a head: the act whole, this store's name for itself,
// the head's commit before it, and the number after the head's.
export async function commitOver(storage: Storage, at: State | null, act: Act) {
  const before = at && (await commitAt(storage, at.commit));
  const number = (before?.number ?? 0) + 1;
  const { when, says, by, at: seen, gone, parts } = act;

  return {
    number,
    bytes: commitBytes({
      act:
        by === undefined ? { when, says, at: seen, gone, parts } : { when, says, by, at: seen, gone, parts },
      own: act.own,
      predecessors: at ? [at.commit] : [],
      number,
    }),
  };
}

// The addresses an act places and takes away: only what changed. A whole it writes gives
// an address to each named holon it now holds and did not before, and takes it from each
// it no longer holds; the parts it held before and still holds keep theirs. A holon it
// renames or lets go moves within, or out of, every whole that held it and still does.
async function addressChanges(
  storage: Storage,
  view: View | null,
  act: Act,
  before: Map<string, Holon | null>,
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
