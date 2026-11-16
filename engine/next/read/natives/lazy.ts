// What is worked out only as it is needed: a branch, the value chosen by a key, and a
// fallback. If is the bare one; case and else are lazy so that what is not chosen is
// never worked out.

import type { Lazy } from "./natives.ts";
import { truly } from "../values.ts";

export const lazy: Record<string, Lazy> = {
  if: async ([test, then, otherwise]) =>
    truly(await test?.()) ? ((await then?.()) ?? null) : ((await otherwise?.()) ?? null),

  async case([value, cases, otherwise]) {
    const key = await value?.();
    const chosen = typeof key === "string" ? await cases?.key(key) : undefined;
    return chosen !== undefined ? chosen : ((await otherwise?.()) ?? null);
  },

  else: async ([value, otherwise]) => (await value?.()) ?? (await otherwise?.()) ?? null,
};
