// Compaction: the newest runs merged into one, down to the oldest run that holds no more
// entries than all the runs newer than it together. Afterwards each run holds more than
// all those newer than it, so a store of n entries has at most about log2(n) runs, and
// an entry is rewritten only when the run holding it at least doubles. Every entry keeps
// its stamp, so the merged run answers every head the runs did. It touches no holon and
// writes no commit: history never sees it.
//
// It meets other writers where every writer meets, at the head, and never stands in an
// act's way: losing to an act, it lays its runs again over the act's head; an act losing
// to it only lays its head again. Losing to another compaction, in another process, it
// gives up. The runs it merged are not removed at once, since a read in another process
// may still be in them; they are removed by the next merge, and a read that finds a run
// gone begins again.

import { stateNow, stateText, type State } from "./head.ts";
import { mergedRuns, type Run } from "./run.ts";
import type { Storage } from "./storage/storage.ts";

// How many of the newest runs are to be merged: none, or two or more.
export function merging(runs: Run[]): number {
  let newer = 0;
  let deepest = 0;

  for (const [i, run] of runs.entries()) {
    if (i > 0 && run.count <= newer) deepest = i;
    newer += run.count;
  }

  return deepest ? deepest + 1 : 0;
}

// Merges the newest runs, if any are to be merged, and gives the runs merged, to be
// removed by the next merge; null where nothing was merged.
export async function compact(storage: Storage): Promise<Run[] | null> {
  const now = await stateNow(storage);
  if (!now) return null;

  const merged = now.runs.slice(0, merging(now.runs));
  if (!merged.length) return null;

  const written = await mergedRuns(storage, merged);
  const run: Run = { blob: await storage.put(written.bytes), count: written.count, index: written.index };

  return (await lay(storage, now, merged, run)) ? merged : null;
}

// Moves the head to the merged run in place of the runs it merged, over whatever the head
// now is, so long as they are all still there. Returns whether it was laid.
async function lay(storage: Storage, now: State, merged: Run[], run: Run): Promise<boolean> {
  const at = now.runs.findIndex((each) => each.blob === merged[0]!.blob);
  const still = at >= 0 && merged.every((each, i) => now.runs[at + i]?.blob === each.blob);

  // Another compaction merged them first. What this one wrote is removed only if the
  // head does not use it: a twin compaction from the same runs writes the very same blob.
  if (!still) {
    if (!now.runs.some((each) => each.blob === run.blob)) await storage.remove(run.blob);
    return false;
  }

  const runs = [...now.runs.slice(0, at), run, ...now.runs.slice(at + merged.length)];
  if (await storage.moveHead(stateText(now), stateText({ commit: now.commit, runs }))) return true;
  return lay(storage, (await stateNow(storage))!, merged, run);
}
