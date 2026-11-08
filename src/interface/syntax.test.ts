import { describe, expect, test } from "bun:test";
import type { Expression } from "../engine/expression.ts";
import { addressOf, placeAt, readable, said, samePlace, type Titles } from "./address.ts";
import { parse, print } from "./syntax.ts";

const name = (end: string) => `1M6YBY3G00${end.padStart(5, "0")}`;

const group = name("1");
const not = name("2");
const children = name("3");
const everything = name("4");
const type = name("5");
const or = name("6");
const text = name("7");
const brief = name("A");
const note = name("B");

const titles = new Map([
  [group, "Group by"],
  [not, "Not"],
  [children, "Children of"],
  [everything, "Everything"],
  [type, "Type"],
  [or, "Or"],
  [text, "Text"],
]);

const byTitle = new Map([...titles].map(([id, title]) => [title, [id]]));
const functions: Titles = { titles, byTitle, or };

const roots: Expression = {
  call: { $ref: group },
  with: [
    { call: { $ref: not }, with: [{ call: { $ref: children }, with: [{ call: { $ref: everything } }] }] },
    "type",
  ],
};

describe("the syntax", () => {
  test("an expression is said by its functions' titles, and read back as it was", () => {
    const text = print(roots, titles);

    expect(text).toBe("Group by(Not(Children of(Everything)),:type)");
    expect(parse(text, byTitle)).toEqual(roots);
  });

  test("a holon is said by its name, an argument by its place, words after a colon", () => {
    const typed = { call: { $ref: type }, with: [{ $ref: brief }] };

    expect(print(typed, titles)).toBe(`Type(@${brief})`);
    expect(parse(`Type( @${brief} )`, byTitle)).toEqual(typed);
    expect(parse("Type($0)", byTitle)).toEqual({ call: { $ref: type }, with: [{ arg: 0 }] });
  });

  test("words keep what would end them, by a backslash", () => {
    const search = { call: { $ref: text }, with: ["a (b), c"] };
    const said = print(search, titles);

    expect(said).toBe("Text(:a \\(b\\)\\, c)");
    expect(parse(said, byTitle)).toEqual(search);
  });

  test("a function whose title is shared is said by its name", () => {
    const shared = new Map([...titles, [note, "Type"]]);
    const call = { call: { $ref: note }, with: [{ $ref: brief }] };
    const said = print(call, shared);

    expect(said).toBe(`@${note}(@${brief})`);
    expect(parse(said, byTitle)).toEqual(call);
    expect(() => parse("Type(@" + brief + ")", new Map([["Type", [type, note]]]))).toThrow("more than one");
  });

  test("what cannot be read says where", () => {
    expect(() => parse("Nothing", byTitle)).toThrow("no function Nothing");
    expect(() => parse("Type(", byTitle)).toThrow();
    expect(() => parse("Everything Everything(", byTitle)).toThrow();
    expect(() => parse("@short", byTitle)).toThrow("a holon's name");
    expect(() => parse("Everything,", byTitle)).toThrow("not part of it");
    expect(() => parse("", byTitle)).toThrow("a function, a holon or an argument");
  });
});

describe("the address", () => {
  const base = "https://glass.example/";

  test("a place is said readably, and read back", () => {
    const place = { gathers: roots };
    const address = addressOf("/", place, functions);

    expect(address).toBe("/?look=Group+by(Not(Children+of(Everything)),:type)");
    expect(placeAt(new URL(address, base).href, functions)).toEqual(place);
  });

  test("one holon, and several, are places too", () => {
    const one = { argument: [{ $ref: brief }] };
    const two = { argument: [{ $ref: brief }, { $ref: note }] };

    expect(said(one, functions)).toBe(`@${brief}`);
    expect(placeAt(new URL(addressOf("/", one, functions), base).href, functions)).toEqual(one);
    expect(placeAt(new URL(addressOf("/", two, functions), base).href, functions)).toEqual(two);
  });

  test("the component chosen travels with it", () => {
    const place = { argument: [{ $ref: brief }], component: { $ref: note } };

    expect(placeAt(new URL(addressOf("/", place, functions), base).href, functions)).toEqual(place);
  });

  test("a bare address names no place, and one that cannot be read says so", () => {
    expect(placeAt(base, functions)).toBeUndefined();
    expect(() => placeAt(`${base}?look=Nothing`, functions)).toThrow();
  });

  test("an address escapes only what it must", () => {
    expect(readable("Text(:a b&c)")).toBe("Text(:a+b%26c)");
  });

  test("places are compared by what they say", () => {
    expect(samePlace({ argument: [{ $ref: brief }] }, { argument: [{ $ref: brief }] })).toBe(true);
    expect(samePlace({ argument: [{ $ref: brief }] }, { argument: [{ $ref: note }] })).toBe(false);
    expect(samePlace(undefined, { argument: [{ $ref: note }] })).toBe(false);
  });
});
