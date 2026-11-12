// The natives of history: a store's commits, each with when, what it says, its hashes,
// and which holons it wrote and took out, so what follows from history, what a store
// wrote since a moment, can be written in the language upon it.

import { writtenBy } from "../../integrations/glass/store.ts";
import type { Calling, Native } from "./natives.ts";

export function history({ world }: Calling): Record<string, Native> {
  return {
    log: ([store]) =>
      world.log(String(store)).map((entry) => ({
        at: entry.at,
        says: entry.says,
        hash: entry.hash,
        act: entry.act,
        wrote: writtenBy(entry),
        gone: entry.gone,
      })),
  };
}
