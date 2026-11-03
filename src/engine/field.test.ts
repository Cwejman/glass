import { expect, test } from "bun:test";
import { newId } from "../store/id.ts";
import type { Version } from "../store/objects.ts";
import type { HolonRead } from "./engine.ts";
import { match } from "../interface/drawing.ts";
import { fieldOf, judge, read, type Known, type Past, type Standing } from "./field.ts";

const nothingPast: Past = { versionAt: async () => undefined, isVersion: async () => false };
const TYPE = newId();
const typeType = {
  title: "Type",
  fields: {
    title: { says: "What it is called.", shape: "string" },
    fields: { says: "Its fields.", shape: "json" },
  },
};

function standing(key: string, holons: [string, Version["body"], string[]?][]): Standing {
  const known = new Map<string, Known>();
  for (const [id, body, instance = [TYPE]] of holons)
    known.set(id, {
      key,
      name: `sha256-${"0".repeat(64)}`,
      version: { kind: "version", id, prev: null, instance, body },
    });
  return { key, head: undefined, names: {}, holons: known };
}

test("a field is a value: the home's holons stand before a pulled store's, and references are indexed", async () => {
  const a = newId();
  const b = newId();
  const field = fieldOf([
    standing("home", [[a, { title: "mine" }]]),
    standing("glass", [
      [TYPE, typeType],
      [a, { title: "theirs" }],
      [b, { title: "B", about: { $ref: a } }],
    ]),
  ]);
  expect(((await read(field, nothingPast, { holon: a })) as unknown as HolonRead).body.title).toBe("mine");
  expect(await read(field, nothingPast, { holders: a })).toEqual([{ id: b, key: "about" }]);
});

test("judging a change leaves the field as it was", async () => {
  const field = fieldOf([standing("home", []), standing("glass", [[TYPE, typeType]])]);
  const before = [...field.known.keys()];
  expect(
    await judge(field, nothingPast, { holons: [{ id: newId(), instance: [TYPE], body: { colour: "red" } }] }),
  ).toContain("colour");
  expect(
    await judge(field, nothingPast, { holons: [{ id: TYPE, instance: [TYPE], body: typeType }] }),
  ).toContain("only read");
  expect([...field.known.keys()]).toEqual(before);
});

test("the component that matches a holon's type is chosen before one that takes any, in the kind of slot", () => {
  const brief = newId();
  const [full, face] = [newId(), newId()];
  const component = (id: string, takes: string[], kinds: string[]) =>
    ({
      id,
      store: "glass",
      version: "",
      instance: [],
      body: { takes: takes.map(($ref) => ({ $ref })), kinds: kinds.map(($ref) => ({ $ref })) },
    }) as unknown as HolonRead;
  const any = component("any", [], [full, face]);
  const reader = component("reader", [brief], [full]);
  const holon = {
    id: newId(),
    store: "glass",
    version: "",
    instance: [brief],
    body: {},
  } as unknown as HolonRead;

  expect(match([any, reader], { holon: holon.id }, holon, full)?.id).toBe("reader");
  expect(match([any, reader], { holon: holon.id }, holon, face)?.id).toBe("any");
  expect(match([reader], { holon: holon.id }, holon, face)).toBeUndefined();
});

test("a component can draw a slot only where it is given that kind of thing, in that kind of slot", async () => {
  const { able } = await import("../interface/drawing.ts");
  const full = newId();
  const reader = {
    id: "r",
    store: "glass",
    version: "",
    instance: [],
    body: { takes: [], kinds: [{ $ref: full }] },
  } as unknown as HolonRead;
  const list = {
    ...reader,
    id: "l",
    body: { takes: [], kinds: [{ $ref: full }], argument: "list" },
  } as unknown as HolonRead;
  const either = { ...list, id: "s", body: { ...list.body, argument: "selection" } } as unknown as HolonRead;

  expect(able([reader, list, either], { list: [newId()] }, full)).toEqual([list, either]);
  expect(able([reader, list, either], { holon: newId() }, full)).toEqual([reader, either]);
  expect(able([reader], { holon: newId() }, newId())).toEqual([]);
});

test("a read is one known form and nothing beside it", async () => {
  const { readProblem } = await import("./field.ts");
  const id = newId();
  expect(readProblem({ holon: id })).toBeUndefined();
  expect(readProblem({ holon: id, at: `sha256-${"0".repeat(64)}` })).toBeUndefined();
  expect(readProblem({ gather: { types: true } })).toBeUndefined();
  expect(readProblem({ holon: id, version: 0, body: {}, id })).toContain("nothing beside it");
  expect(readProblem({ instances: id, gather: { types: true } })).toContain("nothing beside it");
  expect(readProblem({ holders: "x" })).toContain("by its id");
  expect(readProblem({ every: true })).toContain("no read every");
  expect(readProblem({ gather: { every: true } })).toContain("no expression every");
});
