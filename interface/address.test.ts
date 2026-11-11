import { describe, expect, test } from "bun:test";
import type { Names } from "../language/text.ts";
import { addressOf, namedAt, placeOf, readable, samePlace, textOf, type Place } from "./address.ts";

const fn = {
  everything: "F0000000000EVRY",
  type: "F0000000000TYPE",
  or: "F00000000000R00",
  group: "F000000000GR0P0",
};
const brief = "B000000000BR1EF";
const note = "N00000000000NTE";
const typeBrief = "T00000000BR1EF0";

// Names enough to read and say these addresses: a few functions, and a route to the brief.
const names: Names = {
  functions: (name) => (name in fn ? [fn[name as keyof typeof fn]] : []),
  holons: ({ store, names }) => (store === "main" && names.join("/") === "The wiki/Glass" ? [brief] : []),
  isFunction: (id) => Object.values(fn).includes(id),
  nameOf: (id) => Object.entries(fn).find(([, each]) => each === id)?.[0],
};

const base = "https://glass.example/";
const said = { names, or: fn.or };
const back = (address: string) => placeOf(namedAt(new URL(address, base).href)!, names, fn.or);

describe("the address", () => {
  test("one holon is said by its route, as where one is, and read back", () => {
    const place: Place = { argument: [{ $ref: brief }] };
    const address = addressOf("/", place, {
      ...said,
      route: { store: "main", names: ["The wiki", "Glass"] },
    });

    expect(address).toBe(`/?place=main/The+wiki/Glass&id=${brief}`);
    expect(back(address)).toEqual(place);
  });

  test("a route that finds nothing now still leads by the id it was written with", () => {
    expect(back(`/?place=main/Moved+away&id=${note}`)).toEqual({ argument: [{ $ref: note }] });
  });

  test("anything else is said in the language, and read back", () => {
    const place: Place = {
      gathers: {
        call: { $ref: fn.group },
        with: [{ call: { $ref: fn.type }, with: [{ $ref: typeBrief }] }, "type"],
      },
    };
    const address = addressOf("/", place, said);

    expect(address).toBe(`/?look=group(type(@${typeBrief}),+%22type%22)`);
    expect(back(address)).toEqual(place);
  });

  test("several holons are a place of either, and a holon without a route is said by its id", () => {
    const one: Place = { argument: [{ $ref: note }] };
    const two: Place = { argument: [{ $ref: brief }, { $ref: note }] };

    expect(addressOf("/", one, said)).toBe(`/?look=@${note}`);
    expect(back(addressOf("/", one, said))).toEqual(one);
    expect(back(addressOf("/", two, said))).toEqual(two);
  });

  test("the component chosen travels with it", () => {
    const place: Place = { argument: [{ $ref: note }], component: { $ref: brief } };
    expect(back(addressOf("/", place, said))).toEqual(place);
  });

  test("a bare address names no place, and one that cannot be read says so", () => {
    expect(namedAt(base)).toBeUndefined();
    expect(() => back("/?look=nothing()")).toThrow("there is no function nothing");
    expect(() => back("/?place=main/Nowhere")).toThrow("finds 0 holons");
  });

  test("what an address needs looked up is said as the language says it", () => {
    expect(textOf(namedAt(`${base}?place=main/The+wiki/Glass`)!)).toBe(`@main:"The wiki"/Glass`);
  });

  test("an address escapes only what it must", () => {
    expect(readable(`search("a b&c")`)).toBe("search(%22a+b%26c%22)");
  });

  test("places are compared by what they say", () => {
    expect(samePlace({ argument: [{ $ref: brief }] }, { argument: [{ $ref: brief }] })).toBe(true);
    expect(samePlace({ argument: [{ $ref: brief }] }, { argument: [{ $ref: note }] })).toBe(false);
    expect(samePlace(undefined, { argument: [{ $ref: note }] })).toBe(false);
  });
});
