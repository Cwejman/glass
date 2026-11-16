// The natives of lists. A fold and a concat are the bare ones; the rest are native for
// speed, since written as folds over lists that never change each would copy its list
// once for every item. What a function gives each item is worked out for all items at
// once, so the stores are asked together.

import type { Value } from "../../../../language/expression.ts";
import type { Calling, Native } from "./natives.ts";
import { keyOf, list, order, same, truly } from "../values.ts";

export function lists({ apply }: Calling): Record<string, Native> {
  const each = (items: Value, fn: Value) => Promise.all(list(items).map((item) => apply(fn, [item])));

  return {
    fold: async ([items, start, fn]) => {
      let acc: Value = start ?? null;
      for (const item of list(items)) acc = await apply(fn, [acc, item]);
      return acc;
    },
    concat: (given) => given.flatMap(list),

    map: ([items, fn]) => each(items!, fn!),
    filter: async ([items, fn]) => {
      const kept = await each(items!, fn!);
      return list(items).filter((_, i) => truly(kept[i]));
    },
    sort: async ([items, fn]) => {
      const all = list(items);
      const by = fn ? await each(all, fn) : all;
      return all
        .map((item, i) => ({ item, by: by[i] }))
        .sort((a, b) => order(a.by, b.by))
        .map(({ item }) => item);
    },
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
