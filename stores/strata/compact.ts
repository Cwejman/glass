// Compaction: the oldest layers waiting are merged into the trees, one new segment for
// all of them, and a root is laid that lists them no longer. It touches no holon. Strata
// runs it when nothing else is under way, one slice at a time. It meets other writers
// where every writer meets, at the head: losing to an act, it lays its root again over the
// act; losing to another compaction, in another process, it gives up and is begun again
// from the trees as they are.

import { trees, type Tree } from "./entries.ts";
import { pendingEntries } from "./read.ts";
import { headNow, rootAt, rootBytes, type Root } from "./root.ts";
import type { Storage } from "./storage/storage.ts";
import { merged, within, type Change, type Pointer } from "./tree.ts";

// How many layers one slice merges, at most, so that one slice is short.
const slice = 8;

// Merges one slice of the layers waiting, the oldest first. Returns whether any still
// wait.
export async function compact(storage: Storage): Promise<boolean> {
  const at = await headNow(storage);
  if (!at) return false;

  const root = await rootAt(storage, at.page);
  const merging = root.pending.slice(0, slice);
  if (!merging.length) return false;

  const { bytes, roots } = await pressed(storage, root, merging);
  const segment = await storage.put(bytes);
  const pressedTrees = Object.fromEntries(
    Object.entries(roots).map(([tree, pointer]) => [tree, within(pointer, segment)]),
  ) as Root["trees"];

  const left = await lay(storage, root, pressedTrees, new Set(merging.map((pending) => pending.layer)));
  return left > 0;
}

// The trees with these layers' entries merged in, oldest layer first, written as one
// segment.
async function pressed(storage: Storage, root: Root, merging: Root["pending"]) {
  const changes = new Map<Tree, Map<string, unknown>>(trees.map((tree) => [tree, new Map()]));

  for (const pending of merging)
    for (const [tree, list] of Object.entries(await pendingEntries(storage, pending)) as [Tree, Change[]][])
      for (const [key, value] of list) changes.get(tree)!.set(key, value);

  const segments: Uint8Array[] = [];
  const roots: Partial<Record<Tree, Pointer | null>> = {};
  let offset = 0;

  for (const tree of trees) {
    const sorted = [...changes.get(tree)!].sort(([a], [b]) => (a < b ? -1 : 1)) as Change[];
    if (!sorted.length) {
      roots[tree] = root.trees[tree] ?? null;
      continue;
    }

    const { bytes, root: top } = await merged(storage, root.trees[tree] ?? null, sorted, offset);
    segments.push(bytes);
    roots[tree] = top;
    offset += bytes.length;
  }

  return { bytes: joined(segments), roots };
}

// The root that replaces the trees and drops the merged layers, laid over whatever the
// head now is, so long as its trees are still those this compaction began from. Losing
// the race for the head to an act, it is laid again over the act. Returns how many layers
// still wait.
async function lay(
  storage: Storage,
  from: Root,
  pressedTrees: Root["trees"],
  merged: Set<string>,
): Promise<number> {
  const name = await storage.head();
  const now = name === null ? null : await rootAt(storage, name);

  // Another compaction laid first, and this one gives up. It removes nothing it wrote: a
  // twin compaction from the same head writes the very same blobs, which later roots may
  // build on. What is left unused is for a sweep.
  if (!now || JSON.stringify(now.trees) !== JSON.stringify(from.trees)) return now?.pending.length ?? 0;

  const pending = now.pending.filter((each) => !merged.has(each.layer));
  const next = await storage.put(
    rootBytes({
      ...now,
      touches: { ids: [], addresses: [] },
      previous: name,
      trees: pressedTrees,
      pending,
      pressed: true,
    }),
  );

  if (await storage.moveHead(name, next)) return pending.length;
  return lay(storage, from, pressedTrees, merged);
}

function joined(parts: Uint8Array[]) {
  const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all;
}
