// Rebuilds a store's index from its history alone, as for a store cloned from git, where
// the history is kept and the index is not: the index removed, every commit indexed again
// from the first, and the runs merged as compaction leaves them. The latest commit is
// the history's, untouched, and every read answers as it did. A store opened with its
// index missing or behind catches it up the same way on its first read or offer; this
// does it at once, and says how long it took.
//
//   bun stores/strata/rebuild.ts <folder of a store>

import { rmSync } from "node:fs";
import { join } from "node:path";
import { caughtUp } from "./catchup.ts";
import { compact } from "./compact.ts";
import { indexNow } from "./head.ts";
import type { Run } from "./run.ts";
import { folderStorages } from "./storage/folder.ts";

export async function rebuild(folder: string) {
  rmSync(join(folder, "index"), { recursive: true, force: true });
  const { history, index } = folderStorages(folder);
  const remove = (runs: Run[]) => Promise.all(runs.map(({ blob }) => index.remove(blob)));

  await caughtUp({ history, index }, remove);
  for (let replaced; (replaced = await compact(index)); ) await remove(replaced);
  return indexNow(index);
}

if (import.meta.main) {
  const folder = process.argv[2]!;
  const began = performance.now();
  const now = await rebuild(folder);
  const seconds = ((performance.now() - began) / 1000).toFixed(1);
  console.log(
    `${folder}: indexed up to ${now?.commit ?? "nothing"} in ${seconds} s, ${now?.runs.length ?? 0} runs`,
  );
}
