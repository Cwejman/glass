import { expect, test } from "bun:test";
import type { HolonRead } from "../engine/compat.ts";
import { candidates, match } from "./finding.ts";

const component = (name: string, takes: string[], kinds: string[], argument?: string, named?: boolean) =>
  ({
    id: name,
    name,
    types: ["component"],
    instance: [],
    store: "glass",
    version: "",
    body: { takes, kinds, ...(argument ? { argument } : {}), ...(named ? { named } : {}) },
  }) as unknown as HolonRead;

const brief = component("Brief", ["brief"], ["full", "face"]);
const wildcard = component("Holon", [], ["full", "face"]);
const reader = component("Reader", [], ["full"], "selection");
const list = component("List", [], ["full", "face"], "list");
const collection = component("Collection", [], ["face"], "expression");
const faceOnly = component("Face only", ["brief"], ["face"]);

const all = [reader, wildcard, brief, list, collection, faceOnly];

const holon = (...types: string[]) => ({ types }) as HolonRead;

const asked = { $ref: "1M6YBY3G0000001" };

test("a holon is drawn by what takes its type, before the wildcard", () => {
  expect(match(all, { holon: "x" }, holon("brief"), "full")).toBe(brief);
  expect(match(all, { holon: "x" }, holon("note"), "full")).toBe(wildcard);
});

test("what cannot draw in that kind of slot is passed by", () => {
  expect(candidates(all, { holon: "x" }, holon("brief"), "full")).not.toContain(faceOnly);
  expect(candidates(all, { holon: "x" }, holon("brief"), "face")).toContain(faceOnly);
});

test("a list is drawn by the list, not by what merely can", () => {
  expect(match(all, { list: ["x"] }, null, "full")).toBe(list);
});

test("a way of looking is drawn by what is given ways of looking, else the list", () => {
  expect(match(all, { gather: asked }, null, "face")).toBe(collection);
  expect(match(all, { gather: asked }, null, "full")).toBe(list);
  expect(match([reader], { gather: asked }, null, "full")).toBeUndefined();
});

test("nothing found is nothing", () => {
  expect(match([brief], { holon: "x" }, holon("note"), "full")).toBeUndefined();
});

test("what is drawn only where named is never found, though it may be chosen", () => {
  const count = component("Count", [], ["full", "face"], "list", true);
  const before = [count, ...all];

  expect(match(before, { list: ["x"] }, null, "full")).toBe(list);
  expect(match(before, { gather: asked }, null, "face")).toBe(collection);
  expect(match([count, wildcard], { holon: "x" }, holon("note"), "full")).toBe(wildcard);
  expect(candidates(before, { list: ["x"] }, null, "full")).toContain(count);
});

test("a value no set is drawn by what takes a value, never by a list", () => {
  const value = component("Value", [], ["full", "face"], "value");
  const withValue = [value, ...all];

  expect(match(withValue, { gather: asked }, null, "full", true)).toBe(value);
  expect(candidates(withValue, { gather: asked }, null, "full", true)).toEqual([value, reader]);
  expect(match(withValue, { gather: asked }, null, "face")).toBe(collection);
});
