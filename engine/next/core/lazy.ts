// What is worked out only as it is needed: a branch, the value chosen by a key, and a
// fallback. If is the bare one; case and else are lazy so that what is not chosen is
// never worked out.

import type { Lazy } from "./natives.ts";
import { truly } from "./values.ts";

export const lazy: Record<string, Lazy> = {
  if: ([test, then, otherwise]) => (truly(test?.()) ? (then?.() ?? null) : (otherwise?.() ?? null)),

  case([value, cases, otherwise]) {
    const key = value?.();
    const chosen = typeof key === "string" ? cases?.key(key) : undefined;
    return chosen !== undefined ? chosen : (otherwise?.() ?? null);
  },

  else: ([value, otherwise]) => value?.() ?? otherwise?.() ?? null,
};
