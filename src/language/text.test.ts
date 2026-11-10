import { describe, expect, test } from "bun:test";
import { parse, print, type Names } from "./text.ts";

// A small field of names: a few functions, and holons some of which share a name.
const functions: Record<string, string> = {
  get: "F00000000000GET",
  type: "F0000000000TYPE",
  filter: "F000000000FTR00",
  eq: "F0000000000000Q",
  size: "F000000000SZE00",
  map: "F00000000000MAP",
  text: "F00000000000TXT",
  everything: "F0000000000EVRY",
  take: "F0000000000TAKE",
};

const holons: { id: string; name?: string; in?: string }[] = [
  { id: "T0000000000TYPS", name: "types" },
  { id: "T00000000MEASRE", name: "measure", in: "T0000000000TYPS" },
  { id: "C00000000MEASRE", name: "measure", in: "C000000000CMPTS" },
  { id: "C000000000CMPTS", name: "components" },
  { id: "W0000000000W1K1", name: "The wiki" },
  { id: "P0000000000PARA" },
];

const names: Names = {
  functions: (name) => (functions[name] ? [functions[name]] : []),
  holons({ names }) {
    let found = holons.filter((holon) => holon.name === names[0]);

    for (const name of names.slice(1)) {
      const within = new Set(found.map(({ id }) => id));
      found = holons.filter((holon) => holon.name === name && holon.in && within.has(holon.in));
    }

    return found.map(({ id }) => id);
  },
  isFunction: (id) => Object.values(functions).includes(id),
  nameOf: (id) =>
    Object.entries(functions).find(([, each]) => each === id)?.[0] ??
    holons.find((holon) => holon.id === id)?.name,
};

const call = (name: string, ...given: unknown[]) => ({
  call: { $ref: functions[name]! },
  ...(given.length ? { with: given } : {}),
});

const read = (text: string) => parse(text, names);

describe("reading", () => {
  test("a call, a holon by its route, a lambda and a key", () => {
    expect(read(`type(@types/measure) | filter(m => eq(m.value, 3)) | size`)).toEqual(
      call(
        "size",
        call("filter", call("type", { $ref: "T00000000MEASRE" }), {
          fn: ["m"],
          gives: call("eq", call("get", { var: "m" }, "value"), 3),
        }),
      ),
    );
  });

  test("a holon by a quoted name, and by its id", () => {
    expect(read(`text(@"The wiki")`)).toEqual(call("text", { $ref: "W0000000000W1K1" }));
    expect(read(`@P0000000000PARA`)).toEqual({ $ref: "P0000000000PARA" });
  });

  test("a function named alone is the function as a value; called, it is given what follows", () => {
    expect(read(`map(@"The wiki", text)`)).toEqual(
      call("map", { $ref: "W0000000000W1K1" }, { $ref: functions.text }),
    );
    expect(read(`everything()`)).toEqual(call("everything"));
  });

  test("a pipe gives what came before as the first argument", () => {
    expect(read(`everything() | take(2)`)).toEqual(call("take", call("everything"), 2));
    expect(read(`everything() | size`)).toEqual(call("size", call("everything")));
  });

  test("lists, records and literals", () => {
    expect(read(`[1, -2.5, "a \\"b\\"", true, null]`)).toEqual({
      list: [1, -2.5, 'a "b"', true, null],
    });
    expect(read(`m => {note: m.note, "two words": 2}`)).toEqual({
      fn: ["m"],
      gives: { record: { note: call("get", { var: "m" }, "note"), "two words": 2 } },
    });
  });

  test("lambdas of several words close over the ones around them", () => {
    expect(read(`(a, b) => map(a, x => eq(x, b))`)).toEqual({
      fn: ["a", "b"],
      gives: call("map", { var: "a" }, { fn: ["x"], gives: call("eq", { var: "x" }, { var: "b" }) }),
    });
  });

  test("a parenthesis that is not a lambda's words groups", () => {
    expect(read(`(everything()) | size`)).toEqual(call("size", call("everything")));
  });

  test("what cannot be read says where", () => {
    expect(() => read(`nothing(1)`)).toThrow("there is no function nothing, at 1");
    expect(() => read(`@measure`)).toThrow("names 2, at 2 of “@measure”; say which by @id");
    expect(() => read(`size(1`)).toThrow("closed by )");
    expect(() => read(`size(1) 2`)).toThrow("not part of it");
    expect(() => read(`m.value`)).toThrow("there is no function m");
  });
});

describe("saying, and reading back", () => {
  const cases = [
    `size(filter(type(@types/measure), m => eq(m.value, 3)))`,
    `map(@"The wiki", text)`,
    `take(everything(), 2)`,
    `(a, b) => map(a, x => eq(x, b))`,
    `m => {note: m.note, "two words": [1, "x", null]}`,
    `@P0000000000PARA`,
    `text(@"The wiki").name`,
    `get(1, "two words")`,
  ];

  for (const text of cases) {
    test(text, () => {
      const data = read(text);
      expect(read(print(data, names))).toEqual(data);
    });
  }

  test("said in the call form, a holon by its id, a key after a dot", () => {
    expect(print(read(`type(@types/measure) | size`), names)).toBe(`size(type(@T00000000MEASRE))`);
    expect(print(read(`text(@"The wiki").name`), names)).toBe(`text(@W0000000000W1K1).name`);
  });

  test("a long number is a number; an id is read only after @", () => {
    expect(read(`[100000000000000]`)).toEqual({ list: [100000000000000] });
  });

  test("a text of many lines says the line where it cannot be read", () => {
    expect(() => read(`size(\n  1,\n  )`)).toThrow("line 3, column 3");
  });

  test("?, for the variables of patterns, is kept", () => {
    expect(() => read(`?x`)).toThrow("kept for the variables of patterns");
  });
});
