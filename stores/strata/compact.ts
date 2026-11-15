// Compaction: the newest runs merged into one, down to the oldest run that holds no more
// entries than all the runs newer than it together. Afterwards each run holds more than
// all those newer than it, so a store of n entries has at most about log2(n) runs, and
// an entry is rewritten only when the run holding it at least doubles. Every entry keeps
// its stamp, so the merged run answers every head the runs did. It touches no holon.
//
// It meets other writers where every writer meets, at the head. Losing to an act, it lays
// its root again over the act. Losing to another compaction, in another process, it gives
// up. Once its root is laid, the runs merged are removed; a read still in them begins
// again.

import { headNow, rootAt, rootBytes } from "./root.ts";
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

// Merges the newest runs, if any are to be merged. Returns whether more merging is wanted.
export async function compact(storage: Storage): Promise<boolean> {
  const at = await headNow(storage);
  if (!at) return false;

  const { runs } = await rootAt(storage, at.page);
  const merged = runs.slice(0, merging(runs));
  if (!merged.length) return false;

  const written = await mergedRuns(storage, merged);
  const run: Run = { blob: await storage.put(written.bytes), count: written.count, index: written.index };

  if (!(await lay(storage, merged, run))) return false;
  for (const each of merged) await storage.remove(each.blob);
  return merging((await rootAt(storage, (await storage.head())!)).runs) > 0;
}

// Lays a root with the merged run in place of the runs it merged, over whatever the head
// now is, so long as they are all still there. Returns whether it was laid.
async function lay(storage: Storage, merged: Run[], run: Run): Promise<boolean> {
  const name = (await storage.head())!;
  const now = await rootAt(storage, name);
  const at = now.runs.findIndex((each) => each.blob === merged[0]!.blob);
  const still = at >= 0 && merged.every((each, i) => now.runs[at + i]?.blob === each.blob);

  // Another compaction merged them first. What this one wrote is removed only if no root
  // uses it: a twin compaction from the same runs writes the very same blob.
  if (!still) {
    if (!now.runs.some((each) => each.blob === run.blob)) await storage.remove(run.blob);
    return false;
  }

  const runs = [...now.runs.slice(0, at), run, ...now.runs.slice(at + merged.length)];
  const next = await storage.put(
    rootBytes({ ...now, touches: { ids: [], addresses: [] }, previous: name, runs, pressed: true }),
  );

  if (await storage.moveHead(name, next)) return true;
  return lay(storage, merged, run);
}
