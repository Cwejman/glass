// What is looked at, said in words: a lambda as the language says it, its key read as a
// field of what it is given, every other call by its function's title.

import { expect, test } from "bun:test";
import { partSaid, type Called, type Functions } from "./parts.ts";

const fn = (id: string, title: string, native?: string): Called => ({
  id,
  title,
  takes: [],
  ...(native ? { native } : {}),
});
const functions: Functions = new Map(
  [
    fn("FILTER", "Filter", "filter"),
    fn("EQ", "eq", "eq"),
    fn("GET", "get", "get"),
    fn("TYPE", "Type", "type"),
  ].map((each) => [each.id, each]),
);
const titleOf = async (id: string) => (id === "THREAD" ? "thread" : id);

test("a lambda is said as the language says it, a key read as a field", async () => {
  const lambda = {
    fn: ["t"],
    gives: {
      call: { $ref: "EQ" },
      with: [{ call: { $ref: "GET" }, with: [{ var: "t" }, "stands"] }, "open"],
    },
  };
  const said = await partSaid(
    functions,
    { call: { $ref: "FILTER" }, with: [{ $ref: "THREAD" }, lambda as never] },
    titleOf,
  );

  expect(said.value).toContain('t => eq(t.stands, "open")');
});

test("what a lambda gives is said by the language: records, quoted keys, a lambda read by a key", async () => {
  const say = async (gives: unknown) =>
    (
      await partSaid(
        functions,
        { call: { $ref: "FILTER" }, with: [{ $ref: "THREAD" }, { fn: ["h"], gives } as never] },
        titleOf,
      )
    ).value;

  expect(await say({ record: { name: { var: "h" }, "a b": 1 } })).toContain('h => {name: h, "a b": 1}');
  expect(await say({ call: { $ref: "GET" }, with: [{ var: "h" }, "år"] })).toContain("h => h.år");
  expect(await say({ call: { $ref: "GET" }, with: [{ fn: ["x"], gives: { var: "x" } }, "k"] })).toContain(
    "h => (x => x).k",
  );
});
