import { expect, test } from "bun:test";
import type { Expression } from "../../engine/expression.ts";
import { begins, changedPart, fits, hasEnough, needs, settled, type Frame } from "./building.ts";
import { call, type Called, type Functions } from "./parts.ts";

const fn = (id: string, takes: string[], native?: string): Called => ({
  id,
  title: id,
  takes,
  ...(native ? { native } : {}),
});

const type = fn("TYPE", ["set"], "type");
const not = fn("NOT", ["set"], "not");
const or = fn("OR", ["set", "sets"], "or");
const group = fn("GROUP", ["set", "axis"], "group");

const functions: Functions = new Map([type, not, or, group].map((each) => [each.id, each]));

const brief = { $ref: "1M6YBY3G0000001" };
const note = { $ref: "1M6YBY3G0000002" };

test("what a function takes next is its next argument, the last repeating", () => {
  expect(needs([])).toBeUndefined();
  expect(needs([{ fn: group, given: [] }])).toBe("set");
  expect(needs([{ fn: group, given: [brief] }])).toBe("axis");
  expect(needs([{ fn: or, given: [brief, note, brief] }])).toBe("sets");
});

test("with nothing being built, what is given is the part itself", () => {
  expect(settled(brief, [])).toEqual({ frames: [], part: brief });
  expect(settled(undefined, [])).toEqual({ frames: [] });
});

test("a value completing a function makes the part", () => {
  expect(settled(brief, [{ fn: type, given: [] }])).toEqual({ frames: [], part: call(type, brief) });
});

test("a value not completing a function is a step", () => {
  const { frames, part } = settled(brief, [{ fn: group, given: [] }]);

  expect(part).toBeUndefined();
  expect(frames).toEqual([{ fn: group, given: [brief] }]);
});

test("a finished function is given to the one beneath it, as Not: Type: Brief is built", () => {
  const frames: Frame[] = [
    { fn: not, given: [] },
    { fn: type, given: [] },
  ];

  expect(settled(brief, frames).part).toEqual(call(not, call(type, brief)));
});

test("what was being built is not changed by asking what would come of it", () => {
  const frames: Frame[] = [{ fn: group, given: [] }];

  settled(brief, frames);

  expect(frames).toEqual([{ fn: group, given: [] }]);
});

test("a function of any number of sets stays open until it is closed", () => {
  const frames: Frame[] = [{ fn: or, given: [brief] }];
  const { frames: after, part } = settled(note, frames);

  expect(part).toBeUndefined();
  expect(hasEnough(after[0]!)).toBe(true);
  expect(hasEnough(frames[0]!)).toBe(false);
  expect(settled(undefined, after).part).toEqual(call(or, brief, note));
});

test("a part given another holon holds both; given one it has, lets it go", () => {
  const was: Expression = call(type, brief);

  expect(changedPart(functions, was, call(type, note))).toEqual([call(type, call(or, brief, note))]);
  expect(changedPart(functions, call(type, call(or, brief, note)), call(type, note))).toEqual([
    call(type, brief),
  ]);
  expect(changedPart(functions, was, call(type, brief))).toEqual([]);
});

test("a part changed to another function is that other part", () => {
  expect(changedPart(functions, call(type, brief), call(not, note))).toEqual([call(not, note)]);
});

test("words are found in any order and any case, and beginnings told apart", () => {
  expect(fits("the  PRIMI", "The primitives")).toBe(true);
  expect(fits("primitives the", "The primitives")).toBe(true);
  expect(fits("the other", "The primitives")).toBe(false);
  expect(begins("the", "The primitives")).toBe(true);
  expect(begins("prim", "The primitives")).toBe(false);
});
