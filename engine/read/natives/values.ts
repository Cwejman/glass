// The natives of values: those that need nothing but the values they are given. Every
// one is total: given what it cannot use, it gives null or nothing, never fails.

import type { Value } from "../../../language/expression.ts";
import { wordsOf } from "../patterns/words.ts";
import { isRecord, kind, list, order, same } from "../values.ts";

const number = (value: unknown) => (typeof value === "number" ? value : undefined);

// The natives of values.
export const values: Record<string, (given: Value[]) => Value> = {
  eq: ([a, b]) => same(a, b),
  lt: ([a, b]) => order(a, b) < 0,
  add: ([a, b]) =>
    number(a) !== undefined && number(b) !== undefined ? (a as number) + (b as number) : null,
  mul: ([a, b]) =>
    number(a) !== undefined && number(b) !== undefined ? (a as number) * (b as number) : null,
  round: ([a]) => (number(a) !== undefined ? Math.round(a as number) : null),
  kind: ([value]) => kind(value),

  join: ([items, between]) =>
    list(items)
      .filter((item) => item !== null)
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join(typeof between === "string" ? between : ""),

  // A text parted wherever the given text stands; parted by nothing, it is its letters.
  split: ([text, by]) => (typeof text === "string" ? text.split(typeof by === "string" ? by : "") : []),

  // The words of a text, or of each text in a list, cut as the index cuts them.
  words: ([text]) => list(text).flatMap((each) => wordsOf(each)),

  // A record with one key set: a holon's own values, a record's, or a list's place.
  put: ([record, key, value]) => ({ ...(isRecord(record) ? record : {}), [String(key)]: value ?? null }),
  keys: ([value]) => (isRecord(value) ? Object.keys(value) : []),
};
