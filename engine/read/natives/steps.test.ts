// The steps of a read and their chain: a pipe chain taken apart into reads of their own,
// each carrying the read's holons, and joined again.

import { describe, expect, test } from "bun:test";
import type { Holon } from "../../../stores/store.ts";
import type { Value } from "../values.ts";
import { steps } from "./steps.ts";

const held = ($ref: string) => ({ $ref, $holds: true });
const use = (id: string, fn: string, args: unknown[]): Holon => ({
  id,
  instance: ["U"],
  body: { fn: { $ref: fn }, args },
});

// `@a | f(1) | g`, as parse carries it: g(f(@a, 1)).
const read = {
  gives: held("~2"),
  holons: [use("~1", "F", [{ $ref: "A" }, 1]), use("~2", "G", [held("~1")])],
};

const apart = (given: unknown) => steps.steps!([given as Value]) as unknown as (typeof read)[];
const together = (given: unknown[]) => steps.chain!([given as Value]) as unknown as typeof read;
const byId = (holons: Holon[]) => Object.fromEntries(holons.map((holon) => [holon.id, holon]));

describe("steps and chain", () => {
  test("each step is what one use adds: the first what the chain begins with, the rest without what was piped in", () => {
    const [first, second, third] = apart(read);
    expect(first as unknown).toEqual({ gives: { $ref: "A" }, holons: read.holons });
    expect(second!.gives).toEqual(held("~1"));
    expect(byId(second!.holons)["~1"]!.body.args).toEqual([1]);
    expect(byId(third!.holons)["~2"]!.body.args).toEqual([]);
    expect(byId(third!.holons)["~1"]).toEqual(read.holons[0]!);
  });

  test("chain joins the steps into the read again", () => {
    const joined = together(apart(read));
    expect(joined.gives).toEqual(read.gives);
    expect(byId(joined.holons)).toEqual(byId(read.holons));
  });

  test("a step taken out, the chain closes over it, and what it held goes", () => {
    const [first, , third] = apart(read);
    expect(together([first, third])).toEqual({
      gives: held("~2"),
      holons: [use("~2", "G", [{ $ref: "A" }])],
    });

    // The first taken out, the next begins the chain as it stands.
    const [, second, last] = apart(read);
    expect(together([second, last])).toEqual({
      gives: held("~2"),
      holons: [use("~2", "G", [held("~1")]), use("~1", "F", [1])],
    });
  });

  test("a read of no carried use is one step; what is not a read gives null", () => {
    expect(apart({ gives: 3 }) as unknown).toEqual([{ gives: 3, holons: [] }]);
    expect(apart("text")).toBeNull();
    expect(together([])).toBeNull();
    expect(together([{ gives: 1 }, { gives: 2 }])).toBeNull();
  });
});
