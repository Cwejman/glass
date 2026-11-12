// The natives of lists. A fold and a concat are the bare ones; the rest are native for
// speed, since written as folds over lists that never change each would copy its list
// once for every item.

import type { Value } from "../../../language/expression.ts";
import type { Calling, Native } from "./natives.ts";
import { keyOf, list, order, same, truly } from "../values.ts";

export function lists({ apply }: Calling): Record<string, Native> {
  return {
    fold: ([items, start, fn]) =>
      list(items).reduce<Value>((acc, item) => apply(fn, [acc, item]), start ?? null),
    concat: (given) => given.flatMap(list),

    map: ([items, fn]) => list(items).map((item) => apply(fn, [item])),
    filter: ([items, fn]) => list(items).filter((item) => truly(apply(fn, [item]))),
    sort: ([items, fn]) =>
      list(items)
        .map((item) => ({ item, by: fn ? apply(fn, [item]) : item }))
        .sort((a, b) => order(a.by, b.by))
        .map(({ item }) => item),
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
