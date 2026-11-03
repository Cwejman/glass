import { expect, test } from "bun:test";
import { newId } from "../store/id.ts";
import type { Version } from "../store/objects.ts";
import { expressionProblem, gather, groups } from "./expression.ts";
import { fieldOf, type Known, type Standing } from "./field.ts";

const TYPE = newId();
const NOTE = newId();
const typeBody = { title: "Type", fields: {} };

function standing(
  key: string,
  holons: [string, Version["body"], string[]][],
  names: Record<string, string> = {},
): Standing {
  const known = new Map<string, Known>();
  for (const [id, body, instance] of holons)
    known.set(id, {
      key,
      name: `sha256-${"0".repeat(64)}`,
      version: { kind: "version", id, prev: null, instance, body },
    });
  return { key, head: undefined, names, holons: known };
}

const a = newId();
const b = newId();
const field = fieldOf([
  standing("home", [[b, { title: "B", about: { $ref: a } }, [NOTE]]]),
  standing(
    "glass",
    [
      [TYPE, typeBody, [TYPE]],
      [NOTE, typeBody, [TYPE]],
      [a, { title: "A" }, [NOTE]],
    ],
    { note: NOTE },
  ),
]);

test("an expression gathers from the field what its form says, in the field's order", () => {
  expect(gather(field, { instances: NOTE })).toEqual([b, a]);
  expect(gather(field, { instances: { $ref: NOTE } })).toEqual([b, a]);
  expect(gather(field, { types: true })).toEqual([TYPE, NOTE]);
  expect(gather(field, { pointing: a })).toEqual([b]);
  expect(gather(field, { named: true })).toEqual([NOTE]);
});

test("expressions compose: what all gather, what any gathers", () => {
  expect(gather(field, { all: [{ instances: NOTE }, { pointing: a }] })).toEqual([b]);
  expect(gather(field, { any: [{ types: true }, { pointing: a }] })).toEqual([b, TYPE, NOTE]);
});

test("a value that is not an expression says what is wrong with it", () => {
  expect(expressionProblem({ instances: NOTE })).toBeUndefined();
  expect(expressionProblem({ all: [{ types: true }, { named: true }] })).toBeUndefined();
  expect(expressionProblem({ instances: "x" })).toContain("names a holon");
  expect(expressionProblem({ types: 1 })).toContain("types: true");
  expect(expressionProblem({ all: [] })).toContain("list of expressions");
  expect(expressionProblem({ every: true })).toContain("no expression every");
  expect(expressionProblem({ types: true, named: true })).toContain("one form");
});

test("there is no looking into what a holon holds by key: a holon's parts are its own to open", () => {
  expect(expressionProblem({ held: a })).toContain("no expression held");
});

test("an expression looks along the field's own axes: everything, what a holon points at, a store", () => {
  expect(gather(field, { everything: true })).toEqual([b, TYPE, NOTE, a]);
  expect(gather(field, { from: b })).toEqual([a]);
  expect(gather(field, { from: a })).toEqual([]);
  expect(gather(field, { store: "glass" })).toEqual([TYPE, NOTE, a]);
  expect(expressionProblem({ store: 1 } as never)).toContain("names a store");
});

test("a grouping gathers what it groups, and gives its collections, each a way of looking of its own", () => {
  const everything = { everything: true } as const;
  expect(gather(field, { group: everything, by: "type" })).toEqual([b, TYPE, NOTE, a]);

  expect(groups(field, { group: everything, by: "type" })).toEqual({
    by: "type",
    groups: [
      { value: NOTE, count: 2, gathers: { instances: { $ref: NOTE } } },
      { value: TYPE, count: 2, gathers: { instances: { $ref: TYPE } } },
    ],
    rest: [],
  });
  expect(groups(field, { group: everything, by: "store" })!.groups).toEqual([
    { value: "glass", count: 3, gathers: { store: "glass" } },
    { value: "home", count: 1, gathers: { store: "home" } },
  ]);
  expect(groups(field, { group: { instances: NOTE }, by: "holder" })).toEqual({
    by: "holder",
    groups: [{ value: b, count: 1, gathers: { all: [{ instances: NOTE }, { from: { $ref: b } }] } }],
    rest: [b],
  });
  expect(groups(field, { everything: true })).toBeNull();
});

test("grouped by the strongest, a set is split along the axis that gives a few groups, evenly filled", () => {
  expect(groups(field, { group: { everything: true }, by: "strongest" })!.by).toBe("type");
  expect(expressionProblem({ group: { everything: true }, by: "colour" } as never)).toContain("groups by");
});

test("an expression nested past its depth is refused", () => {
  let deep: unknown = { types: true };
  for (let i = 0; i < 40; i++) deep = { any: [deep] };
  expect(expressionProblem(deep as never)).toContain("nests at most");
});

test("by the strongest, a dozen groups or fewer outweigh many, however evenly filled", () => {
  const kinds = [newId(), newId()];
  const holders = Array.from({ length: 40 }, () => newId());
  const items = holders.map(() => newId());
  const many = fieldOf([
    standing("glass", [
      ...kinds.map((id) => [id, typeBody, [TYPE]] as [string, Version["body"], string[]]),
      [TYPE, typeBody, [TYPE]],
      ...items.map(
        (id, i) => [id, { title: "x" }, [kinds[i % 4 === 0 ? 0 : 1]!]] as [string, Version["body"], string[]],
      ),
      ...holders.map(
        (id, i) => [id, { part: { $ref: items[i]! } }, [TYPE]] as [string, Version["body"], string[]],
      ),
    ]),
  ]);
  expect(
    groups(many, { group: { any: [{ instances: kinds[0]! }, { instances: kinds[1]! }] }, by: "strongest" })!
      .by,
  ).toBe("type");
});

test("a value every holon shares says nothing, and where nothing splits a set it is given as it is", () => {
  expect(groups(field, { group: { instances: NOTE }, by: "type" })!.groups).toEqual([]);
  expect(groups(field, { group: { instances: NOTE }, by: "strongest" })).toEqual({
    by: "store",
    groups: [
      { value: "home", count: 1, gathers: { all: [{ instances: NOTE }, { store: "home" }] } },
      { value: "glass", count: 1, gathers: { all: [{ instances: NOTE }, { store: "glass" }] } },
    ],
    rest: [],
  });
  expect(groups(field, { group: { from: b }, by: "strongest" })).toEqual({
    by: "type",
    groups: [],
    rest: [a],
  });
});

test("by the strongest, a few kinds outweigh two stores, however unevenly the kinds are filled", () => {
  const kinds = [newId(), newId(), newId(), newId()];
  const holons: [string, Version["body"], string[]][] = Array.from({ length: 40 }, (_, i) => [
    newId(),
    { title: "x" },
    [kinds[i < 34 ? 0 : (i % 3) + 1]!],
  ]);
  const uneven = fieldOf([
    standing("home", holons.slice(0, 3)),
    standing("glass", [
      ...kinds.map((id) => [id, typeBody, [TYPE]] as (typeof holons)[number]),
      ...holons.slice(3),
    ]),
  ]);
  expect(
    groups(uneven, { group: { any: kinds.map((id) => ({ instances: id })) }, by: "strongest" })!.by,
  ).toBe("type");
});

test("a collection deep down is narrowed by its steps side by side", () => {
  const deep = { group: { all: [{ instances: NOTE }, { store: "glass" }] }, by: "holder" } as const;
  expect(groups(field, deep as never)!.groups.map(({ gathers }) => gathers)).toEqual([]);
  const two = { group: { all: [{ everything: true }, { instances: NOTE }] }, by: "store" } as const;
  expect(groups(field, two as never)!.groups[0]!.gathers).toEqual({
    all: [{ everything: true }, { instances: NOTE }, { store: "home" }],
  });
});

test("a match gathers what says each of its words, in any case, but not by the ids it points by", () => {
  const said = fieldOf([
    standing("glass", [
      [a, { title: "The Reader", prose: "draws what is given" }, [NOTE]],
      [b, { title: "B", about: { $ref: a }, from: "wiki/reader.md" }, [NOTE]],
    ]),
  ]);
  expect(gather(said, { match: "reader GIVEN" })).toEqual([a]);
  expect(gather(said, { match: a.slice(0, 8) })).toEqual([]);
  expect(gather(said, { match: "reader.md" })).toEqual([]);
  expect(expressionProblem({ match: "  " })).toContain("words");
  expect(expressionProblem({ match: "reader" })).toBeUndefined();
});
