// Patterns over a few holons made by hand, so what the planner and the join do is seen
// apart from any store that may change.

import { describe, expect, test } from "bun:test";
import type { Holon } from "../../../integrations/glass/store.ts";
import { indexOf } from "./facts.ts";
import { solve, type Clause, type Step } from "./solve.ts";

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

describe("a fact asked once for all its bindings", () => {
  // A field of thirty, the odd tagged and the even ordered, one saying "3" and one 3.
  const many = indexOf(
    [
      ...Array.from({ length: 30 }, (_, n) =>
        holon(`H${String(n).padStart(14, "0")}`, {
          says: n % 3 === 0 ? "fizz" : "plain",
          ...(n % 2 ? { tags: ["fizz"] } : { order: n }),
          ...(n > 0 ? { next: { $ref: `H${String(n - 1).padStart(14, "0")}`, $holds: true } } : {}),
        }),
      ),
      holon(a, { says: "3" }),
      holon(b, { says: 3 }),
    ].map((each) => ({ store: "s", holon: each })),
    () => ({}),
  );

  // The same store, made to say that asking with nothing bound costs nothing, or too
  // much, so each fact is asked once for all, or once for each binding.
  const saying = (unbound: number) => ({
    ...many,
    count: (asked: Parameters<typeof many.count>[0]) =>
      asked.e === undefined && asked.v === undefined ? unbound : many.count(asked),
  });

  // Each way, its variables in one order, so two plans' ways can be compared.
  const said = (where: Clause[], store: typeof many, steps?: Step[]) =>
    solve(where, store, { test: () => true }, steps)
      .map((binding) => JSON.stringify(binding, Object.keys(binding).sort()))
      .sort();

  const joins: Record<string, Clause[]> = {
    "by a holon": [fact(v("w"), "next", v("p")), fact(v("p"), "says", v("s"))],
    "by a value": [fact(v("h"), "says", v("s")), fact(v("g"), "tags", v("s"))],
    "by a key": [fact(v("h"), v("k"), "fizz"), fact(v("g"), v("k"), v("x"))],
    "kinds apart": [fact(v("h"), "order", v("n")), fact(v("g"), "says", v("n"))],
    "by a not": [fact(v("h"), "says", v("s")), { not: [fact(v("w"), "$holds", v("h"))] }],
    "an or leaving a variable unbound": [
      fact(v("h"), "says", v("s")),
      {
        not: [
          { or: [[fact(v("h"), "tags", v("z"))], [fact(v("h"), "order", v("o"))]] },
          fact(v("g"), "says", v("z")),
        ],
      },
    ],
  };

  // Planned by what the store truly counts, or made to ask once for all, each gives what
  // asking each time gives.
  for (const [what, where] of Object.entries(joins)) {
    test(`gives what asking each time gives: ${what}`, () => {
      const each = said(where, saying(Number.MAX_SAFE_INTEGER));

      expect(said(where, many)).toEqual(each);
      expect(said(where, saying(0))).toEqual(each);
    });
  }

  test("an or that leaves a variable unbound is joined once for the rest", () => {
    const steps: Step[] = [];
    said(joins["an or leaving a variable unbound"]!, many, steps);

    expect(
      steps.some(({ step, served }) => step.includes('"says", ?z') && served.includes("once for all")),
    ).toBe(true);
  });

  test("a number is not the text that says it", () => {
    expect(said(joins["kinds apart"]!, saying(0))).toEqual([]);
  });

  test("the plan says how each step was asked, within a not as well", () => {
    const steps: Step[] = [];
    said(joins["by a not"]!, saying(0), steps);

    expect(steps.map(({ step }) => step)).toEqual(['[?h, "says", ?s]', 'within not: [?w, "$holds", ?h]']);
    expect(steps[1]!.served).toContain("once for all, joined by ?h");
  });
});

describe("a word said, as full text search answers it", () => {
  const d = "D00000000000000";
  const e = "E00000000000000";
  const written = indexOf(
    [holon(d, { text: "Glass, the engine." }), holon(e, { text: "glass", note: "An engine" })].map(
      (each) => ({
        store: "s",
        holon: each,
      }),
    ),
    () => ({}),
  );
  const said = (h: unknown, k: unknown, w: unknown): Clause => ({ fact: [h, k, w], words: true });
  const found = (where: Clause[], name: string) =>
    solve(where, written, { test: () => true })
      .map((binding) => JSON.stringify(binding[name]))
      .sort();

  test("a word matches every string under that key that says it, whatever its case and marks", () => {
    expect(found([said(v("h"), "text", "glass")], "h")).toEqual([`{"$ref":"${d}"}`, `{"$ref":"${e}"}`]);
    expect(found([said(v("h"), "text", "engine")], "h")).toEqual([`{"$ref":"${d}"}`]);
  });

  test("a variable in the word's place is bound to each word said", () => {
    expect(found([said({ $ref: d }, "text", v("w"))], "w")).toEqual(['"engine"', '"glass"', '"the"']);
  });

  test("a word said joins with any other clause", () => {
    expect(found([said(v("h"), "text", v("w")), said(v("h"), "note", v("w"))], "w")).toEqual([]);
    expect(found([said(v("h"), "note", "engine"), said(v("h"), "text", v("w"))], "w")).toEqual(['"glass"']);
  });

  test("the plan says a word said was served by key and word", () => {
    const steps: Step[] = [];
    solve([said(v("h"), "text", "glass")], written, { test: () => true }, steps);
    expect(steps[0]!.served).toBe("by key and word");
  });
});

describe("a word said, its word bound before it", () => {
  const f = "F00000000000000";
  const g = "G00000000000000";
  const written = indexOf(
    [holon(f, { text: ["cat", "Cat dog"], label: "Cat", key: "text" }), holon(g, { label: "two words" })].map(
      (each) => ({ store: "s", holon: each }),
    ),
    () => ({}),
  );
  const said = (h: unknown, k: unknown, w: unknown): Clause => ({ fact: [h, k, w], words: true });
  const found = (where: Clause[], name: string) =>
    solve(where, written, { test: () => true }).map((binding) => JSON.stringify(binding[name]));

  test("a word is said once by a holon, however many of its strings say it", () => {
    expect(found([said({ $ref: f }, "text", "cat")], "w")).toHaveLength(1);
  });

  test("a word bound before is folded as the index folds it, and one that is several words matches nothing", () => {
    expect(found([fact(v("h"), "label", v("l")), said(v("h"), "text", v("l"))], "h")).toEqual([
      `{"$ref":"${f}"}`,
    ]);
    expect(found([fact({ $ref: g }, "label", v("l")), said(v("h"), "text", v("l"))], "h")).toEqual([]);
  });

  test("a key bound by another clause is waited for", () => {
    expect(found([said(v("h"), v("k"), "dog"), fact(v("h"), "key", v("k"))], "h")).toEqual([
      `{"$ref":"${f}"}`,
    ]);
  });
});
