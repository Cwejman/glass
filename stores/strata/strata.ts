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
// pages held in memory, and machine.ts over a folder.

import type { Act, Head, Question, Reply, Store, Touches } from "../store.ts";
import type { Storage } from "./storage/storage.ts";
import { answer } from "./read.ts";
import { refusals } from "./refusals.ts";
import { changedSince } from "./changed.ts";
import { headAt, layerOf, rootOver } from "./layer.ts";
import { pressedUnder } from "./compact.ts";

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

// Writes the act once as its own layer, then lays it over the head. After an accepted
// act, one slice of compaction runs without being awaited. Compaction only has work when
// acts arrive, so it keeps pace with them and nothing else needs to run it.
async function offer(storage: Storage, act: Act): Promise<Reply> {
  const at = await headNow(storage);
  const refused = await refusals(storage, at, act);
  if (refused.length) return { refused };

  const ground = { over: act.over, touches: act.touches, act: act.hash };
  const reply = await lay(storage, ground, await storage.put(layerOf(act)), at);
  if ("accepted" in reply) void compact(storage, reply.accepted);

  return reply;
}

// Calls the listener with the current head, then with every move of the head, by this
// process or another.
async function subscribe(storage: Storage, listener: (head: Head | null) => void) {
  const told = async (root: string | null) => listener(root === null ? null : await headAt(storage, root));
  const unsubscribe = storage.watchHead(told);
  await told(await storage.head());
  return unsubscribe;
}

// ---- Within

// What a layer was built against: the head it lies over, what it touches, and the act it
// records, if it records one; a slice of compaction records none.
type Ground = { over: Head | null; touches: Touches; act?: string };

const touchesNothing: Touches = { ids: [], addresses: [] };

// Lays a layer, a blob already written, over the head with one new root page. If another
// writer laid first, it is laid over theirs, unless theirs touched the same holons or
// addresses.
async function lay(storage: Storage, ground: Ground, layer: string, at: Head | null): Promise<Reply> {
  if (await changedSince(storage, ground.over, at, ground.touches)) {
    await storage.remove(layer);
    return { changed: at! };
  }

  const root = await storage.put(rootOver(at, layer, ground.act));
  if (await storage.moveHead(at?.page ?? null, root)) return { accepted: await headAt(storage, root) };

  await storage.remove(root);
  return lay(storage, ground, layer, await headNow(storage));
}

// The store's head as it is now: the act and root page the storage's head names.
async function headNow(storage: Storage): Promise<Head | null> {
  const root = await storage.head();
  return root === null ? null : headAt(storage, root);
}

// Merges one small slice of layers into the trees and lays it like any layer. It touches
// no holon, and the merged entries stay readable in their layers, so a slice that fails
// or is never laid loses nothing: the next act retries it.
async function compact(storage: Storage, at: Head) {
  const slice = await pressedUnder(storage, at).catch(() => null);
  if (slice)
    await lay(storage, { over: at, touches: touchesNothing }, await storage.put(slice), at).catch(() => null);
}
