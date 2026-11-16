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
import { commitAt, headAt, stateNow, stateOf, stateText, takenAt, viewAt, type State } from "./head.ts";
import { afresh, answer, type Viewing } from "./read.ts";
import { refusals } from "./refusals.ts";
import type { Run } from "./run.ts";
import type { Storage } from "./storage/storage.ts";

// How long a run out of the head is kept, in milliseconds.
const grace = 10_000;

export function strata(storage: Storage): Store {
  // In-memory state for scheduling compaction: how many reads and offers are in progress,
  // whether a compaction is running or needed, and the runs merges replaced, with when.
  // The head and commit numbers held for reading are below. All data is in storage, so
  // this can be lost without harm, at worst leaving runs no head names. Compaction runs
  // only when no read or offer is in progress, because they share one thread.
  let underway = 0;
  let compacting = false;
  let toCompact = false;
  let replaced: { run: Run; at: number }[] = [];

  // The head as last read, its runs and its commit's number, and every commit's number
  // once read: a commit never changes, and runs listed for a later head answer for every
  // earlier one, as their entries are stamped. A head asked of that is newer than the one
  // held, or a run gone missing under a read, has the head read again.
  let held: { runs: Run[]; number: number } | null = null;
  const numbers = new Map<string, Promise<number>>();
  const numberOf = (commit: string) => {
    if (!numbers.has(commit))
      numbers.set(
        commit,
        commitAt(storage, commit).then(({ number }) => number),
      );
    return numbers.get(commit)!;
  };

  const viewing: Viewing = async (head, again) => {
    const upTo = await numberOf(head.commit);
    if (again || !held || held.number < upTo) {
      const now = (await stateNow(storage))!;
      held = { runs: now.runs, number: await numberOf(now.commit) };
    }
    return { runs: held.runs, upTo };
  };

  // Answers a question from the store as it was at a head.
  async function read(head: Head, question: Question) {
    underway++;

    try {
      return await answer(storage, head, question, viewing);
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

      const reply = await lay(act, null, await stateNow(storage));

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
    // Each head told in the order the storage moved to it, one after the other, so a
    // later head is never told before an earlier one.
    let told: string | null | undefined;
    let telling = Promise.resolve();
    const tell = (text: string | null) =>
      (telling = telling.then(async () => {
        const commit = text === null ? null : stateOf(text).commit;
        if (commit === told) return;
        const head = commit === null ? null : await headAt(storage, commit);
        told = commit;
        listener(head);
      }));

    const unsubscribe = storage.watchHead(tell);
    await tell(await storage.head());
    return unsubscribe;
  }

  // Writes the act's run and its commit over the head as it stands, and moves the head to
  // the commit with the run added. If the store already took this very act, offered twice,
  // it was taken. If another writer moved the head first, it lays the act again over
  // theirs, unless their act touched the same holons or addresses: then the act goes back
  // to the engine to be judged again. Laid again over another act, its run is worked out
  // again over that act's head, since what it says of addresses depends on what that act
  // wrote; over a head only compaction moved, the run still holds. Blobs are named by
  // their bytes, so a twin offer writes the very blobs the head names: none the head names
  // is removed, and parts are left for a sweep.
  async function lay(act: Act, written: Run | null, now: State | null): Promise<Reply> {
    const drop = async (run: Run | null) => {
      if (run && !now?.runs.some((each) => each.blob === run.blob)) await storage.remove(run.blob);
    };

    const taken = now && (await takenAt(storage, now, act.hash));
    if (taken) {
      await drop(written);
      return { accepted: taken };
    }

    if (await changedSince(storage, act, now)) {
      await drop(written);
      return { changed: await headAt(storage, now!.commit) };
    }

    const run =
      written ??
      (await afresh(async () =>
        writeAct(storage, await viewAt(storage, now && (await headAt(storage, now.commit))), act),
      ));
    const { number, bytes } = await commitOver(storage, now, act);
    const commit = await storage.put(bytes);
    const next = { commit, runs: [{ ...run, act: number }, ...(now?.runs ?? [])] };
    if (await storage.moveHead(now && stateText(now), stateText(next)))
      return { accepted: await headAt(storage, commit) };

    const moved = await stateNow(storage);
    if (moved?.commit === now?.commit) return lay(act, run, moved);

    if (moved?.commit !== commit) await storage.remove(commit);
    if (!moved?.runs.some((each) => each.blob === run.blob)) await storage.remove(run.blob);
    return lay(act, null, moved);
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
