// Strata: glass's own kind of store. Each act it takes is kept as three things written
// once and never changed: its part, the holons it writes here; its commit, the act whole
// and the commit before, the store's history; and its run, its entries in the index, by
// id, by address, by fact, by word and by act. Every entry is stamped with its act's
// number, so the runs answer for every commit the store has had; compaction merges runs
// as they grow, and the index grows with what changes, never with how many commits there
// are.
//
// The history and the index are kept apart, in two storages. The history is the record:
// its parts and commits, and its head naming the latest commit. The index is worked out
// from the history and can trail it: its head names the commit it is up to and its runs,
// and whoever finds it behind the commit it reads, or missing, catches it up first, as
// catchup.ts does. So a store can be kept, as in git, by its history alone.
//
// All data is in the storages, folders on a machine or in OPFS in a browser, made by
// machine.ts or browser.ts. Any number of strata instances, in one process or several,
// can share them; they coordinate only through the two heads.

import type { Act, Head, Question, Reply, Store } from "../store.ts";
import { caughtUp, type Laid } from "./catchup.ts";
import { changedSince } from "./changed.ts";
import { commitOver, writePart } from "./commit.ts";
import { compact } from "./compact.ts";
import { commitAt, headAt, indexNow, latestCommit, takenAt, type State } from "./head.ts";
import { answer, type Viewing } from "./read.ts";
import { refusals } from "./refusals.ts";
import type { Run } from "./run.ts";
import type { Storages } from "./storage/storage.ts";

// How long a run out of the index's head is kept, in milliseconds.
const grace = 10_000;

export function strata(storages: Storages): Store {
  const { history, index } = storages;

  // In-memory state for scheduling compaction: how many reads and offers are in progress,
  // whether a compaction is running or needed, and the runs merges replaced, with when.
  // The index held for reading is below. All data is in storage, so this can be lost
  // without harm, at worst leaving runs no head names. Compaction runs only when no read
  // or offer is in progress, because they share one thread.
  let underway = 0;
  let compacting = false;
  let toCompact = false;
  let replaced: { run: Run; at: number }[] = [];
  const retire = (runs: Run[]) => replaced.push(...runs.map((run) => ({ run, at: Date.now() })));

  // The index brought up to the latest commit, one catching up at a time in this process,
  // each after the one before.
  let catching: Promise<unknown> = Promise.resolve();
  const catchUp = (laid?: Laid) => {
    const caught = catching.then(() => caughtUp(storages, retire, laid));
    catching = caught.catch(() => {});
    toCompact = true;
    return caught;
  };

  // The index as last read, its runs and the number of the commit it is up to, and every
  // commit's number once read: a commit never changes, and runs listed for a later commit
  // answer for every earlier one, as their entries are stamped. A head asked of that is
  // newer than the index held, or a run gone missing under a read, has the index read
  // again, and caught up if it is not up to the latest commit.
  let held: { runs: Run[]; number: number } | null = null;
  const numbers = new Map<string, Promise<number>>();
  const numberOf = (commit: string) => {
    if (!numbers.has(commit))
      numbers.set(
        commit,
        commitAt(history, commit).then(({ number }) => number),
      );
    return numbers.get(commit)!;
  };

  const viewing: Viewing = async (head, again) => {
    const upTo = await numberOf(head.commit);
    if (again || !held || held.number < upTo) {
      let now = await indexNow(index);
      if (now?.commit !== (await latestCommit(history))) now = await catchUp();
      held = { runs: now!.runs, number: await numberOf(now!.commit) };
    }
    return { runs: held.runs, upTo };
  };

  // Answers a question from the store as it was at a head.
  async function read(head: Head, question: Question) {
    underway++;

    try {
      return await answer(storages, head, question, viewing);
    } finally {
      underway--;
      void compactWhenIdle();
    }
  }

  // Writes the act's part, then lays its commit over the latest.
  async function offer(act: Act): Promise<Reply> {
    underway++;

    try {
      const refused = await refusals(act);
      if (refused.length) return { refused };

      await writePart(history, act);
      return await lay(act);
    } finally {
      underway--;
      void compactWhenIdle();
    }
  }

  // Calls the listener with the current head, then with every move of it to another
  // commit, by this process or another.
  async function subscribe(listener: (head: Head | null) => void) {
    // Each head told in the order the storage moved to it, one after the other, so a
    // later head is never told before an earlier one.
    let told: string | null | undefined;
    let telling = Promise.resolve();
    const tell = (commit: string | null) =>
      (telling = telling.then(async () => {
        if (commit === told) return;
        const head = commit === null ? null : await headAt(history, commit);
        told = commit;
        listener(head);
      }));

    const unsubscribe = history.watchHead(tell);
    await tell(await history.head());
    return unsubscribe;
  }

  // Writes the act's commit over the latest, with the index caught up to it, and moves
  // the history's head to the commit; then indexes it. If the store already took this
  // very act, offered twice, it was taken. If another writer moved the head first, it
  // lays the act again over theirs, unless their act touched the same holons or
  // addresses: then the act goes back to the engine to be judged again. Commits are named
  // by their bytes, so a twin offer writes the very commit the head names, and that one
  // is not removed.
  async function lay(act: Act): Promise<Reply> {
    const now: State | null = await catchUp();

    const taken = now && (await takenAt(storages, now, act.hash));
    if (taken) return { accepted: taken };

    if (await changedSince(storages, act, now)) return { changed: await headAt(history, now!.commit) };

    const commit = await history.put(await commitOver(history, now?.commit ?? null, act));
    if (!(await history.moveHead(now?.commit ?? null, commit))) {
      if ((await history.head()) !== commit) await history.remove(commit);
      return lay(act);
    }

    await catchUp({ commit, act });
    return { accepted: await headAt(history, commit) };
  }

  // Merges runs while no read or offer is in progress and runs are to be merged. The runs
  // a merge replaced are removed once they have been out of the index's head for a while,
  // so a read in another process that began in them has long finished.
  async function compactWhenIdle() {
    if (!toCompact || compacting || underway) return;
    compacting = true;
    toCompact = false;

    try {
      const ripe = replaced.filter(({ at }) => Date.now() - at > grace);
      replaced = replaced.filter((each) => !ripe.includes(each));
      for (const { run } of ripe) await index.remove(run.blob);

      const merged = await compact(index);
      if (merged) {
        retire(merged);
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
