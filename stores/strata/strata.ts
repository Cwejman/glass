// Strata: glass's own kind of store. Each act is written as a thin layer over the last,
// and never changed. Compaction merges the layers' lists into deep trees, a small slice
// at a time. Every root it has had stays readable, and those roots are its history.
//
// A layer holds an act's holons, their new versions, and small sorted lists for finding
// them: by id, by address, and by the facts and words they contain. The deep trees hold
// the same lists merged, each entry pointing to the layer its version is in. A root is
// one page that ties a moment together: the act it records, the previous root, the
// trees, and the layers not yet merged into them. A read starts at a root and searches
// the trees and those few layers, a few pages deep.
//
// Strata keeps no state of its own. Everything is in its storage, a folder on a machine
// or OPFS in a browser, which knows nothing of holons. A storage never changes a page,
// and moves its head only if the head is still where the writer last saw it, so of
// writers racing, one wins and the others retry. Any number of strata over one storage,
// in one process or many, meet at its head.
//
// Each place strata runs has an entry that makes its storage: browser.ts over OPFS, with
// pages held in memory, and machine.ts over a folder. Compaction is not among the store's
// methods: whoever starts a store starts its compactor beside it (compactor.ts).

import type { Act, Head, Question, Reply, Store } from "../store.ts";
import { changedSince } from "./changed.ts";
import { layerOf, rootOver } from "./layer.ts";
import { answer } from "./read.ts";
import { refusals } from "./refusals.ts";
import { headAt, headNow, type Pending } from "./root.ts";
import type { Storage } from "./storage/storage.ts";

// The store's three methods, over the storage given.
export function strata(storage: Storage): Store {
  return {
    read: (head, question) => read(storage, head, question),
    offer: (act) => offer(storage, act),
    subscribe: (listener) => subscribe(storage, listener),
  };
}

// Answers a question from the store as it was at a head.
async function read(storage: Storage, head: Head, question: Question) {
  return answer(storage, head, question);
}

// Writes the act once as its own layer, then lays it over the head.
async function offer(storage: Storage, act: Act): Promise<Reply> {
  const at = await headNow(storage);
  const refused = await refusals(storage, at, act);
  if (refused.length) return { refused };

  const layer = await layerOf(storage, at, act);
  const pending = { layer: await storage.put(layer.bytes), entries: layer.entries };

  return lay(storage, act, pending, at);
}

// Calls the listener with the current head, then with every move of the head, by this
// process or another.
async function subscribe(storage: Storage, listener: (head: Head | null) => void) {
  const told = async (root: string | null) => listener(root === null ? null : await headAt(storage, root));
  const unsubscribe = storage.watchHead(told);
  await told(await storage.head());
  return unsubscribe;
}

// Lays an act's layer over the head with one new root. If another writer laid first, it
// is laid over theirs, unless theirs touched the same holons or addresses: then the
// layer is taken back, and the engine judges the act again.
async function lay(storage: Storage, act: Act, pending: Pending, at: Head | null): Promise<Reply> {
  if (await changedSince(storage, act.over, at, act.touches)) {
    await storage.remove(pending.layer);
    return { changed: at! };
  }

  const root = await storage.put(await rootOver(storage, at, pending, act));
  if (await storage.moveHead(at?.page ?? null, root)) return { accepted: await headAt(storage, root) };

  await storage.remove(root);
  return lay(storage, act, pending, await headNow(storage));
}
