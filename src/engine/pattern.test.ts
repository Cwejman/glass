// Patterns over a few holons made by hand, so what the planner and the join do is seen
// apart from any store that may change.

import { describe, expect, test } from "bun:test";
import type { Holon } from "../store/store.ts";
import { indexOf } from "./facts.ts";
import { solve, type Clause } from "./pattern.ts";

const holon = (id: string, body: Holon["body"], instance: string[] = ["T00000000000000"]): Holon => ({
  id,
  instance,
  body,
});

const a = "A00000000000000";
const b = "B00000000000000";
const c = "C00000000000000";

const stores = indexOf(
  [
    holon(a, { says: "one", holds: [{ $ref: b, $holds: true }] }),
    holon(b, { says: "two", tags: ["x", "y"], points: { $ref: c } }),
    holon(c, { says: "two", order: 3 }),
  ].map((each) => ({ store: "s", holon: each })),
  () => ({}),
);

const v = (name: string) => ({ "?": name });
const fact = (e: unknown, k: unknown, x: unknown): Clause => ({ fact: [e, k, x] });
const values = (where: Clause[], name: string) =>
  solve(where, stores, { test: () => true })
    .map((binding) => JSON.stringify(binding[name]))
    .sort();

describe("patterns over facts made by hand", () => {
  test("a fact clause finds what says a value, and kinds are kept apart", () => {
    expect(values([fact(v("h"), "says", "two")], "h")).toEqual([`{"$ref":"${b}"}`, `{"$ref":"${c}"}`]);
    expect(values([fact(v("h"), "order", "3")], "h")).toEqual([]);
    expect(values([fact(v("h"), "order", 3)], "h")).toEqual([`{"$ref":"${c}"}`]);
  });

  test("a list gives a fact for each item, and a reference holding is said under $holds", () => {
    expect(values([fact({ $ref: b }, "tags", v("t"))], "t")).toEqual(['"x"', '"y"']);
    expect(values([fact(v("w"), "$holds", v("p"))], "p")).toEqual([`{"$ref":"${b}"}`]);
  });

  test("a variable shared between clauses joins them", () => {
    const where = [
      fact(v("w"), "$holds", v("p")),
      fact(v("p"), "points", v("q")),
      fact(v("q"), "says", v("s")),
    ];
    expect(values(where, "s")).toEqual(['"two"']);
  });

  test("a variable twice in one fact asks the fact to agree with itself", () => {
    expect(values([fact(v("x"), "says", v("x"))], "x")).toEqual([]);
  });

  test("not lets go of what its clauses hold for, its own variables free", () => {
    const where = [fact(v("h"), "says", v("s")), { not: [fact(v("w"), "$holds", v("h"))] }];
    expect(values(where, "h")).toEqual([`{"$ref":"${a}"}`, `{"$ref":"${c}"}`]);
  });

  test("a constant where a holon or a key stands, that cannot be one, matches nothing", () => {
    expect(values([fact("zzz", "says", v("s"))], "s")).toEqual([]);
    expect(values([fact(v("h"), 3, v("s"))], "s")).toEqual([]);
  });
});
