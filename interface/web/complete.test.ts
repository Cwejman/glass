import { describe, expect, test } from "bun:test";
import { completing, matching, taken } from "./complete.ts";

describe("completion in the bar", () => {
  test("at the start, or after a pipe, a function's name; after @, a holon", () => {
    expect(completing("")).toBeUndefined();
    expect(completing("|")).toEqual({ kind: "function", from: 1, typed: "" });
    expect(completing("@Knowledge | ge")).toEqual({ kind: "function", from: 13, typed: "ge" });
    expect(completing("si")).toEqual({ kind: "function", from: 0, typed: "si" });
    expect(completing("@Kno")).toEqual({ kind: "holon", from: 0, typed: "Kno" });
    expect(completing('x | in(@"The au')).toEqual({ kind: "holon", from: 7, typed: "The au" });
    expect(completing("add(1, 2")).toBeUndefined();
    // Only what is before the caret is being typed.
    expect(completing("| ge | size", 4)).toEqual({ kind: "function", from: 2, typed: "ge" });
  });

  test("those beginning with what is typed come first, then the shorter", () => {
    const names = ["map", "group", "get", "target", "getAll"].map((name) => ({ name }));
    expect(matching(names, "get").map(({ name }) => name)).toEqual(["get", "getAll", "target"]);
    expect(matching(names, "", 2).map(({ name }) => name)).toEqual(["get", "getAll"]);
  });

  test("an option taken puts its text in place of what was typed, the caret after it", () => {
    const now = completing("@First | ge | size", 11)!;
    expect(taken("@First | ge | size", 11, now, { name: "get", insert: "get" })).toEqual({
      text: "@First | get | size",
      caret: 12,
    });
  });
});
