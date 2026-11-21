// Catching the index up to the history. The history is the record and the index is worked
// out from it, so an index lost, never written, or behind the commits, as in a store cloned
// from git with its history alone, is brought up to the latest commit one commit at a
// time: each commit's act read back from the commit and its part, and its run written over
// the index as of the commit before, as the offer that took it would have written it.
//
// A run follows from the history alone and is named by its bytes, so two catching up the
// same commits write the same runs; whichever moves the index's head first wins, and the
// other reads it again and carries on. Catching up many commits, the runs are merged
// before each one, as compaction would have merged them between acts, so each is indexed
// over a few runs rather than every one before it. An index up to a commit the history
// does not have, as when the history was replaced, is begun again from nothing. A writer
// that has just laid a commit gives its act as offered, so it is not read back.

import { contentOf, hashOf } from "../act.ts";
import type { Holon } from "../store.ts";
import { writeRun, type Indexed } from "./commit.ts";
import { compact } from "./compact.ts";
import { commitAt, indexNow, latestCommit, stateOf, stateText, type Commit, type State } from "./head.ts";
import type { Run } from "./run.ts";
import { Missing, type Storage, type Storages } from "./storage/storage.ts";

const decoder = new TextDecoder();

// What is done with runs a merge replaced: removed at once, or once no read is in them.
export type Retire = (runs: Run[]) => unknown;

// A commit just laid, and its act as offered.
export type Laid = { commit: string; act: Indexed };

// Indexes every commit the index is behind, and gives the index's head, then up to the
// latest commit; null for a store never written.
export async function caughtUp(storages: Storages, retire: Retire, laid?: Laid): Promise<State | null> {
  const { history, index } = storages;

  for (;;) {
    const latest = await latestCommit(history);
    const text = await index.head();
    const now = text === null ? null : stateOf(text);
    if (latest === null) return null;
    if (now?.commit === latest) return now;

    // A run a merge elsewhere removed under the catching up has it begin again from the
    // index's head; a blob missing with the head unmoved is missing from the history.
    try {
      await indexUpTo(storages, latest, now, retire, laid);
    } catch (error) {
      if (!(error instanceof Missing) || (await index.head()) === text) throw error;
    }
  }
}

// Indexes the commits after the index's, up to the latest, until done or until another
// writer moves the index's head first.
async function indexUpTo(
  { history, index }: Storages,
  latest: string,
  now: State | null,
  retire: Retire,
  laid?: Laid,
) {
  // now is what the index's head holds, and base the index built on: the same, but for
  // an index of another history, which is begun again.
  const behind = await commitsAfter(history, latest, now?.commit ?? null);
  let base = behind.reached ? now : null;

  for (const [i, { name, commit }] of behind.commits.entries()) {
    if (i > 0 && base) {
      for (let replaced; (replaced = await compact(index)); ) await retire(replaced);
      const merged = await indexNow(index);
      if (merged?.commit !== base.commit) return;
      now = base = merged;
    }

    const view = base && { runs: base.runs, upTo: commit.number - 1 };
    const act = name === laid?.commit ? laid.act : await actOf(history, commit);
    const run = await writeRun({ history, index }, view, act);
    const next = { commit: name, runs: [{ ...run, act: commit.number }, ...(base?.runs ?? [])] };
    if (!(await index.moveHead(now && stateText(now), stateText(next)))) return;
    now = base = next;
  }
}

// The commits after since up to the latest, oldest first, and whether since was reached
// walking back; for since null, every commit.
async function commitsAfter(history: Storage, latest: string, since: string | null) {
  const commits: { name: string; commit: Commit }[] = [];

  for (let name: string | null = latest; name !== since; ) {
    if (name === null) return { commits: commits.reverse(), reached: false };
    const commit = await commitAt(history, name);
    commits.push({ name, commit });
    name = commit.predecessors[0] ?? null;
  }

  return { commits: commits.reverse(), reached: true };
}

// A commit's act as its run is worked out from: the act its commit keeps whole, and the
// holons of its part.
async function actOf(history: Storage, { act, own }: Commit): Promise<Indexed> {
  const part = act.parts.find(([store]) => store === own)?.[1];
  const holons = part
    ? decoder
        .decode(await history.read(part))
        .split("\n")
        .map((line) => JSON.parse(line) as Holon)
    : [];

  return { hash: await hashOf(contentOf(act)), own, parts: act.parts, gone: act.gone, holons, born: [] };
}
