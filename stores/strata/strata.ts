// Strata: glass's own kind of store. Each act is written once, as a thin layer over the
// last, and never changed. Compaction merges the layers' entries into deep trees. Every
// root strata has had stays readable, and those roots are its history.
//
// A layer holds an act's holons, their new versions, and the act's entries for finding
// them: by id, by address, and by the facts and words they say. A root ties a moment
// together: the act it records, the root before it, the trees, and the layers not yet
// merged into them. A read starts at a root, and looks in those layers and the trees.
//
// Everything strata is rests in its storage, which knows nothing of holons: a folder on a
// machine, or OPFS in a browser, each made by an entry, machine.ts or browser.ts. Any
// number of strata over one storage, in one process or many, meet at its head.

import type { Act, Head, Question, Reply, Store } from "../store.ts";
import { changedSince } from "./changed.ts";
import { compact } from "./compact.ts";
import { layerOf, rootOver } from "./layer.ts";
import { answer } from "./read.ts";
import { refusals } from "./refusals.ts";
import { headAt, headNow, type Pending } from "./root.ts";
import type { Storage } from "./storage/storage.ts";

export function strata(storage: Storage): Store {
  // What is happening, never what is: the reads and offers under way, and whether
  // compaction runs or has work. Losing it loses nothing. Compaction waits until nothing
  // is under way, since one thread runs one thing at a time.
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

  // Writes the act once as its own layer, then lays it over the head.
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

  // Lays the act's layer over the head with one new root. If another writer laid first,
  // it is laid over theirs, unless theirs touched the same holons or addresses: then the
  // layer is taken back, and the engine judges the act again.
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

  // Compacts one slice at a time, at most eight layers, while nothing is under way and
  // layers still wait.
  async function compactWhenIdle() {
    if (!toCompact || compacting || underway) return;
    compacting = true;
    toCompact = false;

    try {
      toCompact = (await compact(storage)) || toCompact;
    } catch {
      // A slice that fails loses nothing: its layers still wait, read where they lie.
    } finally {
      compacting = false;
    }

    return compactWhenIdle();
  }

  return { read, offer, subscribe };
}
