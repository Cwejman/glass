// Strata: glass's own kind of store. Each act is written once, as a layer of its holons'
// new versions, and never changed, beside a run of its index entries, by id, by address,
// by fact and by word. A root records one head: its act and its number, the previous
// root, and the runs of the index. Every entry is stamped with its act's number, so the
// runs answer for every head the store has had; compaction merges runs as they grow, and
// the index grows with what changes, never with how many heads there are.
//
// All data is in the storage, a folder on a machine or OPFS in a browser, made by
// machine.ts or browser.ts. Any number of strata instances, in one process or several,
// can share a storage; they coordinate only through its head.

import type { Act, Head, Question, Reply, Store } from "../store.ts";
import { changedSince } from "./changed.ts";
import { compact } from "./compact.ts";
import { rootOver, writeLayer } from "./layer.ts";
import { afresh, answer } from "./read.ts";
import { refusals } from "./refusals.ts";
import { headAt, headNow, viewAt } from "./root.ts";
import type { Run } from "./run.ts";
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

  // Writes the act as a layer and a run, then moves the head to a new root that adds the
  // run.
  async function offer(act: Act): Promise<Reply> {
    underway++;

    try {
      const at = await headNow(storage);
      const refused = await afresh(() => refusals(storage, at, act));
      if (refused.length) return { refused };

      const run = await afresh(async () => writeLayer(storage, await viewAt(storage, at), act));
      const reply = await lay(act, run, at);

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

  // Writes a root that adds the run, and moves the head to it. If another writer moved
  // the head first, it retries on top of theirs, unless their act touched the same holons
  // or addresses: then the act goes back to the engine to be judged again, and its run is
  // removed. Its layer is left for a sweep, since a twin offer of the same act writes the
  // very same blob.
  async function lay(act: Act, run: Run, at: Head | null): Promise<Reply> {
    if (await changedSince(storage, act.over, at, act.touches)) {
      await storage.remove(run.blob);
      return { changed: at! };
    }

    const root = await storage.put(await rootOver(storage, at, run, act));
    if (await storage.moveHead(at?.page ?? null, root)) return { accepted: await headAt(storage, root) };

    await storage.remove(root);
    return lay(act, run, await headNow(storage));
  }

  // Merges two runs at a time, while no read or offer is in progress and runs are to be
  // merged.
  async function compactWhenIdle() {
    if (!toCompact || compacting || underway) return;
    compacting = true;
    toCompact = false;

    try {
      toCompact = (await compact(storage)) || toCompact;
    } catch {
      // A failed merge loses nothing: the runs it began from are still the index.
    } finally {
      compacting = false;
    }

    return compactWhenIdle();
  }

  return { read, offer, subscribe };
}
