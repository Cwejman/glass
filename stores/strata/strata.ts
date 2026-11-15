// Strata: glass's own kind of store. Each act it takes is kept as three things written
// once and never changed: its part, the holons it writes here; its commit, the act whole
// and the commit before, the store's history; and its run, its entries in the index, by
// id, by address, by fact, by word and by act. The head names the latest commit and the
// runs of the index. Every entry is stamped with its act's number, so the runs answer for
// every commit the store has had; compaction merges runs as they grow, and the index
// grows with what changes, never with how many commits there are.
//
// All data is in the storage, a folder on a machine or OPFS in a browser, made by
// machine.ts or browser.ts. Any number of strata instances, in one process or several,
// can share a storage; they coordinate only through its head.

import type { Act, Head, Question, Reply, Store } from "../store.ts";
import { changedSince } from "./changed.ts";
import { commitOver, writeAct } from "./commit.ts";
import { compact } from "./compact.ts";
import { headAt, stateNow, stateOf, stateText, viewAt, type State } from "./head.ts";
import { afresh, answer } from "./read.ts";
import { refusals } from "./refusals.ts";
import type { Run } from "./run.ts";
import type { Storage } from "./storage/storage.ts";

// How long a run out of the head is kept, in milliseconds.
const grace = 10_000;

export function strata(storage: Storage): Store {
  // In-memory state, used only to schedule compaction: how many reads and offers are in
  // progress, whether a compaction is running or needed, and the runs merges replaced,
  // with when. All data is in storage, so this can be lost without harm, at worst leaving
  // runs no head names. Compaction runs only when no read or offer is in progress,
  // because they share one thread.
  let underway = 0;
  let compacting = false;
  let toCompact = false;
  let replaced: { run: Run; at: number }[] = [];

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

  // Writes the act's part and run, then moves the head to its commit with its run added.
  async function offer(act: Act): Promise<Reply> {
    underway++;

    try {
      const refused = await refusals(act);
      if (refused.length) return { refused };

      const now = await stateNow(storage);
      const run = await afresh(async () =>
        writeAct(storage, await viewAt(storage, now && (await headAt(storage, now.commit))), act),
      );
      const reply = await lay(act, run, now);

      if ("accepted" in reply) toCompact = true;
      return reply;
    } finally {
      underway--;
      void compactWhenIdle();
    }
  }

  // Calls the listener with the current head, then with every move of it to another
  // commit, by this process or another. Compaction moves the head to the same commit, and
  // no listener is told of that.
  async function subscribe(listener: (head: Head | null) => void) {
    let told: string | null | undefined;
    const tell = async (text: string | null) => {
      const commit = text === null ? null : stateOf(text).commit;
      if (commit === told) return;
      told = commit;
      listener(commit === null ? null : await headAt(storage, commit));
    };

    const unsubscribe = storage.watchHead(tell);
    await tell(await storage.head());
    return unsubscribe;
  }

  // Writes the act's commit over the head as it stands, and moves the head to it with the
  // act's run added. If another writer moved the head first, it lays the act again over
  // theirs, unless their act touched the same holons or addresses: then the act goes back
  // to the engine to be judged again, and its run is removed. If theirs was this very act,
  // offered twice, it was taken. Blobs are named by their bytes, so a twin offer writes the
  // very blobs the head now names: none the head names is removed, and the part is left
  // for a sweep.
  async function lay(act: Act, run: Run, now: State | null): Promise<Reply> {
    if (now && (await headAt(storage, now.commit)).act === act.hash) return { accepted: await headAt(storage, now.commit) };

    if (await changedSince(storage, act, now)) {
      if (!now!.runs.some((each) => each.blob === run.blob)) await storage.remove(run.blob);
      return { changed: await headAt(storage, now!.commit) };
    }

    const { number, bytes } = await commitOver(storage, now, act);
    const commit = await storage.put(bytes);
    const next = { commit, runs: [{ ...run, act: number }, ...(now?.runs ?? [])] };
    if (await storage.moveHead(now && stateText(now), stateText(next))) return { accepted: await headAt(storage, commit) };

    const moved = await stateNow(storage);
    if (moved?.commit !== now?.commit && moved?.commit !== commit) await storage.remove(commit);
    return lay(act, run, moved);
  }

  // Merges runs while no read or offer is in progress and runs are to be merged. The runs
  // a merge replaced are removed once they have been out of the head for a while, so a
  // read in another process that began in them has long finished.
  async function compactWhenIdle() {
    if (!toCompact || compacting || underway) return;
    compacting = true;
    toCompact = false;

    try {
      const ripe = replaced.filter(({ at }) => Date.now() - at > grace);
      replaced = replaced.filter((each) => !ripe.includes(each));
      for (const { run } of ripe) await storage.remove(run.blob);

      const merged = await compact(storage);
      if (merged) {
        replaced.push(...merged.map((run) => ({ run, at: Date.now() })));
        toCompact = true;
      }
    } catch {
      // A failed merge loses nothing: the runs it began from are still the index.
    } finally {
      compacting = false;
    }

    return compactWhenIdle();
  }

  return { read, offer, subscribe };
}
