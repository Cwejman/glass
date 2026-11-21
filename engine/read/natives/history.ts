// The natives of history: a store's commits, newest first, each with when, what it says,
// its content hash, who made it, the heads its maker had read, by store root, and which
// holons it took out, so what follows from history can be written in the language upon it.

import type { Calling, Native } from "./natives.ts";

export function history({ field }: Calling): Record<string, Native> {
  return {
    log: async ([store]) =>
      (await field.log(String(store))).map(({ hash, when, says, by, at, gone }) => ({
        when,
        says,
        hash,
        by: by ?? null,
        at: (at ?? []).map(([root, head]) => ({ store: { $ref: root }, head: head as never })),
        gone,
      })),
  };
}
