// Strata: glass's own kind of store. Each act is written once, as a layer, and never
// changed. Compaction merges the layers' index entries into B-trees. Every root written
// stays readable, so the store can be read as it was at any earlier head.
//
// A layer holds one act: its holons' new versions and its index entries, by id, by
// address, by fact and by word. A root records one head: its act, the previous root, the
// trees, and the layers not yet merged. A read starts at a root and looks in those
// layers, then in the trees.
//
// All data is in the storage, a folder on a machine or OPFS in a browser, made by
// machine.ts or browser.ts. Any number of strata instances, in one process or several,
// can share a storage; they coordinate only through its head.

import type { Act, Head, Question, Reply, Store } from "../store.ts";
import { changedSince } from "./changed.ts";
import { compact } from "./compact.ts";
import { layerOf, rootOver } from "./layer.ts";
import { answer } from "./read.ts";
import { refusals } from "./refusals.ts";
import { headAt, headNow, type Pending } from "./root.ts";
import type { Storage } from "./storage/storage.ts";

export function strata(storage: Storage): Store {
  // In-memory state, used only to schedule compaction: how many reads and offers are in
  // progress, and whether a compaction is running or needed. All data is in storage, so
  // this can be lost without harm. Compaction runs only when no read or offer is in
  // progress, because they share one thread.
  let underway = 0;
  let compacting = false;
  let toCompact = false;

  // Answers a question from the store as it was at a head.
  async function read(head: Head, question: Question) {
    underway++;

    try {
      return await answer(storage, head, question);
    } finally {
      underway--;
      void compactWhenIdle();
    }
  }

  // Writes the act as a layer, then moves the head to a new root that includes it.
  async function offer(act: Act): Promise<Reply> {
    underway++;

    try {
      const at = await headNow(storage);
      const refused = await refusals(storage, at, act);
      if (refused.length) return { refused };

      const layer = await layerOf(storage, at, act);
      const pending = { layer: await storage.put(layer.bytes), entries: layer.entries };
      const reply = await lay(act, pending, at);

      if ("accepted" in reply) toCompact = true;
      return reply;
    } finally {
      underway--;
      void compactWhenIdle();
    }
  }

  // Calls the listener with the current head, then with every move of the head, by this
  // process or another.
  async function subscribe(listener: (head: Head | null) => void) {
    const told = async (root: string | null) => listener(root === null ? null : await headAt(storage, root));
    const unsubscribe = storage.watchHead(told);
    await told(await storage.head());
    return unsubscribe;
  }

  // Writes a root that adds the layer, and moves the head to it. If another writer moved
  // the head first, it retries on top of theirs, unless their act touched the same holons
  // or addresses: then the layer is removed, and the act goes back to the engine to be
  // judged again.
  async function lay(act: Act, pending: Pending, at: Head | null): Promise<Reply> {
    if (await changedSince(storage, act.over, at, act.touches)) {
      await storage.remove(pending.layer);
      return { changed: at! };
    }

    const root = await storage.put(await rootOver(storage, at, pending, act));
    if (await storage.moveHead(at?.page ?? null, root)) return { accepted: await headAt(storage, root) };

    await storage.remove(root);
    return lay(act, pending, await headNow(storage));
  }

  // Compacts one slice of at most eight layers at a time, while no read or offer is in
  // progress and layers are still pending.
  async function compactWhenIdle() {
    if (!toCompact || compacting || underway) return;
    compacting = true;
    toCompact = false;

    try {
      toCompact = (await compact(storage)) || toCompact;
    } catch {
      // A failed slice loses nothing: its layers stay pending, and reads still find them.
    } finally {
      compacting = false;
    }

    return compactWhenIdle();
  }

  return { read, offer, subscribe };
}
