import { expect, test } from "bun:test";
import { newId } from "../store/id.ts";
import type { Version } from "../store/objects.ts";
import type { HolonRead } from "./engine.ts";
import { match } from "../interface/interface.ts";
import { fieldOf, judge, read, type Known, type Past, type Standing } from "./field.ts";

const nothingPast: Past = { versionAt: async () => undefined, isVersion: async () => false };
const TYPE = newId();
const typeType = {
  title: "Type",
  fields: { title: { says: "What it is called.", shape: "string" }, fields: { says: "Its fields.", shape: "json" } },
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
  expect(await judge(field, nothingPast, { holons: [{ id: TYPE, instance: [TYPE], body: typeType }] })).toContain(
    "only read",
  );
  expect([...field.known.keys()]).toEqual(before);
});

test("the component that matches a holon's type is chosen before one that takes any", () => {
  const brief = newId();
  const component = (id: string, takes: string[], draws: string[]) =>
    ({
      id,
      store: "glass",
      version: "",
      instance: [],
      body: { takes: takes.map(($ref) => ({ $ref })), draws },
    }) as unknown as HolonRead;
  const any = component("any", [], ["whole", "face"]);
  const reader = component("reader", [brief], ["whole"]);
  const holon = { id: newId(), store: "glass", version: "", instance: [brief], body: {} } as unknown as HolonRead;
  expect(match([any, reader], holon, "whole")?.id).toBe("reader");
  expect(match([any, reader], holon, "face")?.id).toBe("any");
  expect(match([reader], holon, "face")).toBeUndefined();
});
