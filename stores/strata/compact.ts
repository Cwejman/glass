// Compaction: the layers waiting are merged into the trees, one new segment for all of
// them, and a root is laid that lists them no longer. It runs after every act, and again
// by itself while layers still wait, so a read seldom checks more than one or two. It
// touches no holon and blocks no one. In one process one runs at a time for a storage;
// across processes, if another compaction laid first, this one gives up and starts again
// from the trees as they are.

import type { Head } from "../store.ts";
import { trees, type Tree } from "./entries.ts";
import { pendingEntries } from "./read.ts";
import { headNow, rootAt, rootBytes, type Root } from "./root.ts";
import type { Storage } from "./storage/storage.ts";
import { merged, within, type Change, type Pointer } from "./tree.ts";

// The storages a compaction is running on in this process. An act that lands while one
// runs starts no other: the running one finds its layer on its next round.
const running = new WeakSet<Storage>();

export async function compact(storage: Storage, at: Head) {
  if (running.has(storage)) return;
  running.add(storage);

  try {
    await compactFrom(storage, at);
  } finally {
    running.delete(storage);
  }
}

async function compactFrom(storage: Storage, at: Head): Promise<void> {
  const root = await rootAt(storage, at.page);
  if (!root.pending.length) return;

  const { bytes, roots } = await pressed(storage, root);
  const segment = await storage.put(bytes);
  const pressedTrees = Object.fromEntries(
    Object.entries(roots).map(([tree, pointer]) => [tree, within(pointer, segment)]),
  ) as Root["trees"];

  await lay(storage, root, pressedTrees, new Set(root.pending.map((pending) => pending.layer)));

  const now = await headNow(storage);
  if (now) return compactFrom(storage, now);
}

// The trees with every pending layer's entries merged in, oldest layer first, written as
// one segment.
async function pressed(storage: Storage, root: Root) {
  const changes = new Map<Tree, Map<string, unknown>>(trees.map((tree) => [tree, new Map()]));

  for (const pending of root.pending)
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
// the race for the head to an act, it is laid again over the act.
async function lay(storage: Storage, from: Root, pressedTrees: Root["trees"], merged: Set<string>) {
  const name = await storage.head();
  const now = name && (await rootAt(storage, name));

  // Another compaction laid first, and this one gives up. It removes nothing it wrote: a
  // twin compaction from the same head writes the very same blobs, which later roots may
  // build on. What is left unused is for a sweep.
  if (!now || JSON.stringify(now.trees) !== JSON.stringify(from.trees)) return;

  const next = await storage.put(
    rootBytes({
      ...now,
      touches: { ids: [], addresses: [] },
      previous: name,
      trees: pressedTrees,
      pending: now.pending.filter((pending) => !merged.has(pending.layer)),
      pressed: true,
    }),
  );

  if (await storage.moveHead(name, next)) return;
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
