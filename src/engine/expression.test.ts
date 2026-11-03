import { expect, test } from "bun:test";
import { newId } from "../store/id.ts";
import type { Version } from "../store/objects.ts";
import { expressionProblem, gather } from "./expression.ts";
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

test("an expression can look outward: what a holon holds, in the order it holds them", () => {
  const whole = newId();
  const first = newId();
  const second = newId();
  const looking = fieldOf([
    standing("home", [
      [whole, { title: "W", parts: [{ $ref: second }, { $ref: first }], about: { $ref: TYPE } }, [NOTE]],
      [first, { title: "1" }, [NOTE]],
      [second, { title: "2" }, [NOTE]],
    ]),
    standing("glass", [
      [TYPE, typeBody, [TYPE]],
      [NOTE, typeBody, [TYPE]],
    ]),
  ]);
  expect(gather(looking, { held: whole })).toEqual([second, first, TYPE]);
  expect(gather(looking, { held: whole, under: "parts" })).toEqual([second, first]);
  expect(expressionProblem({ held: whole, under: "parts" })).toBeUndefined();
  expect(expressionProblem({ held: whole, by: "parts" })).toContain("held takes only");
});

test("an expression nested past its depth is refused", () => {
  let deep: unknown = { types: true };
  for (let i = 0; i < 40; i++) deep = { any: [deep] };
  expect(expressionProblem(deep as never)).toContain("nests at most");
});
