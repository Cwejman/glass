// The natives of lists. A fold and a concat are the bare ones; the rest are native for
// speed, since written as folds over lists that never change each would copy its list
// once for every item. What a function gives each item is worked out for all items at
// once, so the stores are asked together, and waited on only where it must be.

import { keyOf, list, order, same, truly, type Value } from "../values.ts";
import { after, all, each as folded } from "../maybe.ts";
import type { Calling, Native } from "./natives.ts";

export function lists({ apply }: Calling): Record<string, Native> {
  const each = (items: Value, fn: Value) => all(list(items).map((item) => apply(fn, [item])));

  return {
    fold: ([items, start, fn]) => folded(list(items), start ?? null, (acc, item) => apply(fn, [acc, item])),
    concat: (given) => given.flatMap(list),

    map: ([items, fn]) => each(items!, fn!),
    filter: ([items, fn]) => after(each(items!, fn!), (kept) => list(items).filter((_, i) => truly(kept[i]))),
    sort: ([items, fn]) =>
      after(fn ? each(items!, fn) : list(items), (by) =>
        list(items)
          .map((item, i) => ({ item, by: by[i] }))
          .sort((a, b) => order(a.by, b.by))
          .map(({ item }) => item),
      ),
    slice: ([items, from, to]) =>
      list(items).slice(Number(from ?? 0), typeof to === "number" ? to : undefined),
    reverse: ([items]) => [...list(items)].reverse(),

    // Hashed, so a list is weighed once, not once for every item.
    has: ([items, item]) => list(items).some((each) => same(each, item)),
    distinct: ([items]) => {
      const seen = new Set<string>();
      return list(items).filter((item) => !seen.has(keyOf(item)) && (seen.add(keyOf(item)), true));
    },
    minus: ([from, out]) => {
      const gone = new Set(list(out).map(keyOf));
      return list(from).filter((item) => !gone.has(keyOf(item)));
    },
  };
}
