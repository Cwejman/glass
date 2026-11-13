// Strata: glass's own kind of store. Each act is laid down as a thin layer over the last,
// and never changed again. Compaction presses the thin layers' lists into deep trees, a
// small slice at a time; and every root ever stood at stays readable, which is the
// history.
//
// A layer holds an act's holons, their new versions, and small sorted lists of what
// finds them: their ids, their addresses, and the facts and words they say. The deep
// trees hold the same lists merged, each entry pointing to the layer its version lies
// in. A root is one page tying a moment together: the act it records, the root before
// it, the trees as they stand, and the layers not yet pressed into them. A read starts
// at a root and looks in the trees and those few layers, a few pages deep.
//
// It keeps nothing of its own: all of it rests in a storage, a folder on a machine,
// OPFS in the browser, or wherever bytes rest, which knows nothing of holons. A storage
// keeps pages, never changing one, and moves its head only if the head still stands
// where it was seen, so of writers at the same instant one moves it and the others go
// again. Strata keeps nothing of its own beside it: it is functions over the storage it
// is given, and any number over one storage, in one process or many, meet at its head.

import type { Act, Head, Question, Reply, Store, Touches } from "../store.ts";
import type { Pages, Storage } from "./storage.ts";
import { answer } from "./read.ts";
import { refusals } from "./refusals.ts";
import { changedSince } from "./changed.ts";
import { layerOf, rootOver } from "./layer.ts";
import { pressedUnder } from "./compact.ts";

// A store over the storage given: the three functions an engine is handed.
export function strata(storage: Storage): Store {
  return {
    read: (head, question) => read(storage, head, question),
    offer: (act) => offer(storage, act),
    subscribe: (listener) => subscribe(storage, listener),
  };
}

// A question answered from the store as it stood at a head.
async function read(storage: Storage, head: Head, question: Question) {
  return answer(storage, head, question);
}

// An act taken in: written once as its own layer, then laid over the head. Once it is
// in, one slice of compaction is pressed while the act is answered; compaction only
// ever has work because acts come, so it keeps pace with them, and the store keeps
// itself in order without anyone running it.
async function offer(storage: Storage, act: Act): Promise<Reply> {
  const at = await storage.head();
  const refused = await refusals(storage, at, act);
  if (refused.length) return { refused };

  const reply = await lay(storage, act, await storage.put(layerOf(act)), at);
  if ("accepted" in reply) void compact(storage, reply.accepted);

  return reply;
}

// Subscribed to: the listener given where the store stands now, then every later move of
// its head, by this process or another.
async function subscribe(storage: Storage, listener: (head: Head | null) => void) {
  const unsubscribe = storage.watchHead(listener);
  listener(await storage.head());
  return unsubscribe;
}

// ---- Within

// What a layer was worked out from: the root it stood over, and what it touches.
type Ground = { over: Head | null; touches: Touches };

const touchesNothing: Touches = { ids: [], addresses: [] };

// A layer laid over the head by one page, its root. Where another laid first, it is
// laid over theirs, unless theirs touched what this one touches.
async function lay(storage: Storage, ground: Ground, layer: Pages, at: Head | null): Promise<Reply> {
  if (await changedSince(storage, ground.over, at, ground.touches)) {
    await storage.drop(layer);
    return { changed: at! };
  }

  const next = await storage.put(rootOver(at, layer));
  if (await storage.moveHead(at, next)) return { accepted: next };

  await storage.drop(next);
  return lay(storage, ground, layer, await storage.head());
}

// One small slice of the thin layers pressed into the trees and laid like any layer. It
// touches no holon, and what it presses is still read where it lay, so a slice that
// fails or is never laid loses nothing: the next act presses it.
async function compact(storage: Storage, at: Head) {
  const slice = await pressedUnder(storage, at).catch(() => null);
  if (slice) await lay(storage, { over: at, touches: touchesNothing }, await storage.put(slice), at).catch(() => null);
}
