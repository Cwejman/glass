import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate } from "../engine/next/read/evaluate.ts";
import { contentOf, hashOf, partOf } from "../stores/act.ts";
import type { Act, Holon } from "../stores/store.ts";
import { folderStorage } from "../stores/strata/storage/folder.ts";
import { strata } from "../stores/strata/strata.ts";
import { parse, print, printRead, printUse, syntax, toExpression, toRead, type Names } from "./text.ts";

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
  find: "F0000000000FIND",
  not: "F00000000000NOT",
};

// The language's own types.
const types: Record<string, string> = {
  use: "L00000000000USE",
  function: "L000000000FUNCT",
  value: "L000000000VALUE",
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
  typeOf: (name) => types[name],
};

const call = (name: string, ...given: unknown[]) => ({
  call: { $ref: functions[name]! },
  ...(given.length ? { with: given } : {}),
});

const read = (text: string) => parse(text, names);
const parsed = (text: string): unknown => read(text);

describe("reading", () => {
  test("a call, a holon by its route, a lambda and a key", () => {
    expect(parsed(`type(@types/measure) | filter(m => eq(m.value, 3)) | size`)).toEqual(
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
    expect(parsed(`text(@"The wiki")`)).toEqual(call("text", { $ref: "W0000000000W1K1" }));
    expect(parsed(`@P0000000000PARA`)).toEqual({ $ref: "P0000000000PARA" });
  });

  test("a function named alone is the function as a value; called, it is given what follows", () => {
    expect(parsed(`map(@"The wiki", text)`)).toEqual(
      call("map", { $ref: "W0000000000W1K1" }, { $ref: functions.text }),
    );
    expect(parsed(`everything()`)).toEqual(call("everything"));
  });

  test("a pipe gives what came before as the first argument", () => {
    expect(parsed(`everything() | take(2)`)).toEqual(call("take", call("everything"), 2));
    expect(parsed(`everything() | size`)).toEqual(call("size", call("everything")));
  });

  test("lists, records and literals", () => {
    expect(parsed(`[1, -2.5, "a \\"b\\"", true, null]`)).toEqual({
      list: [1, -2.5, 'a "b"', true, null],
    });
    expect(parsed(`m => {note: m.note, "two words": 2}`)).toEqual({
      fn: ["m"],
      gives: { record: { note: call("get", { var: "m" }, "note"), "two words": 2 } },
    });
  });

  test("lambdas of several words close over the ones around them", () => {
    expect(parsed(`(a, b) => map(a, x => eq(x, b))`)).toEqual({
      fn: ["a", "b"],
      gives: call("map", { var: "a" }, { fn: ["x"], gives: call("eq", { var: "x" }, { var: "b" }) }),
    });
  });

  test("a parenthesis that is not a lambda's words groups", () => {
    expect(parsed(`(everything()) | size`)).toEqual(call("size", call("everything")));
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
      expect(parsed(print(data, names))).toEqual(data);
    });
  }

  test("said in the call form, a holon by its id, a key after a dot", () => {
    expect(print(read(`type(@types/measure) | size`), names)).toBe(`size(type(@T00000000MEASRE))`);
    expect(print(read(`text(@"The wiki").name`), names)).toBe(`text(@W0000000000W1K1).name`);
  });

  test("a long number is a number; an id is read only after @", () => {
    expect(parsed(`[100000000000000]`)).toEqual({ list: [100000000000000] });
  });

  test("a text of many lines says the line where it cannot be read", () => {
    expect(() => read(`size(\n  1,\n  )`)).toThrow("line 3, column 3");
  });

  test("?x is a pattern's variable, said and read back", () => {
    expect(parsed(`?x`)).toEqual({ "?": "x" });
    expect(print(read(`[?x, "said", ?y]`), names)).toBe(`[?x, "said", ?y]`);
  });
});

// ---- Uses

const reading = (text: string) => toRead(syntax(text), names);

describe("reading into uses, and saying them again", () => {
  const cases = [
    `size(filter(type(@types/measure), m => eq(m.value, 3)))`,
    `type(@types/measure) | filter(m => eq(m.value, 3)) | size`,
    `map(@"The wiki", text)`,
    `everything() | take(2)`,
    `take(everything(), 2)`,
    `(a, b) => map(a, x => eq(x, b))`,
    `m => {note: m.note, "two words": [1, "x", null]}`,
    `@P0000000000PARA`,
    `text(@"The wiki").name`,
    `get(1, "two words")`,
    `(everything()) | size`,
    `[1, -2.5, "a \\"b\\"", true, null]`,
    `[?x, "said", ?y]`,
  ];

  for (const text of cases) {
    test(text, () => {
      const read = reading(text);
      const said = printRead(read, names);

      expect(said).toBe(print(parse(text, names), names));
      expect(reading(said)).toEqual(read);
    });
  }

  test("a call is a use carried under a handle; a pipe gives what came before first", () => {
    expect(reading(`everything() | take(2)`)).toEqual({
      gives: { $ref: "~1", $holds: true },
      holons: [
        {
          id: "~1",
          instance: [types.use],
          body: { fn: { $ref: functions.take }, args: [{ $ref: "~2", $holds: true }, 2] },
        },
        { id: "~2", instance: [types.use], body: { fn: { $ref: functions.everything }, args: [] } },
      ],
    });
    expect(reading(`3`)).toEqual({ gives: 3 });
    expect(reading(`@"The wiki"`)).toEqual({ gives: { $ref: "W0000000000W1K1" } });
  });

  test("a lambda is a function held where it is written, its words placeholders of the kind value", () => {
    expect(reading(`m => eq(m, 3)`)).toEqual({
      gives: { $ref: "~1", $holds: true },
      holons: [
        {
          id: "~1",
          instance: [types.function],
          body: { input: [{ $ref: "~2", $holds: true }], body: { $ref: "~3", $holds: true } },
        },
        { id: "~2", instance: [types.value], name: "m", body: {} },
        { id: "~3", instance: [types.use], body: { fn: { $ref: functions.eq }, args: [{ $ref: "~2" }, 3] } },
      ],
    });
  });

  test("lists and records are JSON as they are, a held use at each place one is written", () => {
    const { gives, holons } = reading(`{n: [1, size(2)], "two words": true}`);

    expect(gives).toEqual({ n: [1, { $ref: "~1", $holds: true }], "two words": true });
    expect(holons).toEqual([
      { id: "~1", instance: [types.use], body: { fn: { $ref: functions.size }, args: [2] } },
    ]);
    expect(() => reading(`{"?": "x"}`)).toThrow("would be read as a holon or a variable");
  });

  test("within find a lambda is a test, its words the pattern's variables", () => {
    const read = reading(`find(?n, [?h, "name", ?n], n => eq(n, "x"), not(m => eq(m, "y")))`);

    expect(read.holons![0]!.body.args).toEqual([
      { "?": "n" },
      [{ "?": "h" }, "name", { "?": "n" }],
      { $ref: "~2", $holds: true },
      { $ref: "~3", $holds: true },
    ]);
    expect(read.holons![1]!.body.args).toEqual([{ "?": "n" }, "x"]);
    expect(printRead(read, names)).toBe(`find(?n, [?h, "name", ?n], eq(?n, "x"), not(eq(?m, "y")))`);
    expect(reading(printRead(read, names))).toEqual(read);
  });

  test("a stored use is said by its name where reused, and as it is written alone", () => {
    const tally: Holon = {
      id: "U000000000TALLY",
      instance: [types.use],
      name: "tally",
      body: { fn: { $ref: functions.size }, args: [{ $ref: "W0000000000W1K1" }] },
    };
    const stored = (id: string) => (id === tally.id ? tally : undefined);
    const named: Names = { ...names, holons: ({ names: [name] }) => (name === "tally" ? [tally.id] : []) };

    expect(printRead({ gives: [{ $ref: tally.id }] }, named, stored)).toBe(`[@tally]`);
    expect(printRead({ gives: { $ref: tally.id } }, names, stored)).toBe(`@${tally.id}`);
    expect(printUse(tally.id, named, stored)).toBe(`size(@W0000000000W1K1)`);
  });

  test("the language's types not in the field, a text is not read into uses", () => {
    expect(() => toRead(syntax(`size(1)`), { ...names, typeOf: undefined })).toThrow(
      "type use is not in the field",
    );
  });
});

// ---- Uses worked out by the new engine, as the earlier form is

const made: string[] = [];
afterAll(() => made.forEach((at) => rmSync(at, { recursive: true, force: true })));

const id = (n: number) => String(n).padStart(15, "0");

// One store: the language's types and the natives the texts call, and a note.
const natives = ["add", "map", "get", "find", "eq", "if", "lt", "size", "not"];
const stored: Holon[] = [
  {
    id: id(1),
    instance: [],
    name: "function",
    mould: { input: { says: "", shape: { list: "ref" }, holds: true, optional: true } },
    body: {},
  },
  {
    id: id(2),
    instance: [],
    name: "use",
    mould: { fn: { says: "", shape: "ref" }, args: { says: "", shape: "json" } },
    body: {},
  },
  { id: id(3), instance: [], name: "value", mould: {}, body: {} },
  { id: id(4), instance: [], name: "note", mould: {}, body: {} },
  { id: id(5), instance: [id(4)], name: "Notes", body: { text: "Glass holds holons" } },
  ...natives.map((name, i) => ({ id: id(10 + i), instance: [id(1)], name, body: { native: name } })),
];

const storedNames: Names = {
  functions: (name) =>
    stored.filter((holon) => holon.name === name && holon.instance.includes(id(1))).map(({ id }) => id),
  holons: ({ names }) => stored.filter((holon) => holon.name === names[0]).map(({ id }) => id),
  isFunction: (each) => stored.some((holon) => holon.id === each && holon.instance.includes(id(1))),
  nameOf: (each) => stored.find((holon) => holon.id === each)?.name,
  typeOf: (name) => ({ function: id(1), use: id(2), value: id(3) })[name],
};

async function storeOf(holons: Holon[]) {
  const folder = mkdtempSync(join(tmpdir(), "glass-text-"));
  made.push(folder);
  const store = strata(folderStorage(folder));
  const part = partOf(holons);
  const said = {
    when: "2026-11-18T00:00:00.000Z",
    at: [] as Act["at"],
    says: "a test",
    gone: [],
    parts: [["glass", part && (await hashOf(part))]] as Act["parts"],
  };
  const reply = await store.offer({
    ...said,
    hash: await hashOf(contentOf(said)),
    own: "glass",
    holons,
    born: holons.map((holon) => holon.id),
    over: null,
    touches: { ids: holons.map((holon) => holon.id), addresses: [] },
  });
  if (!("accepted" in reply)) throw new Error(JSON.stringify(reply));
  return { stores: new Map([["glass", { store }]]), heads: { glass: reply.accepted } };
}

describe("a text read into uses is worked out", () => {
  const texts: [string, unknown][] = [
    [`add(2, 3)`, 5],
    [`[1, 2, 3] | map(x => add(x, x))`, [2, 4, 6]],
    [
      `[1, 2] | map(x => {n: x, twice: add(x, x)})`,
      [
        { n: 1, twice: 2 },
        { n: 2, twice: 4 },
      ],
    ],
    [`[1, 2] | map(x => x)`, [1, 2]],
    [
      `[1, 2] | map(x => map([10, 20], y => add(x, y)))`,
      [
        [11, 21],
        [12, 22],
      ],
    ],
    [`if(lt(1, 2), "yes", "no")`, "yes"],
    [`@Notes.text`, "Glass holds holons"],
    [`find(?h, [?h, "instance", @note])`, [{ $ref: id(5) }]],
    [`find(?h, [?h, "name", ?n], n => eq(n, "note"))`, [{ $ref: id(4) }]],
    // Every named holon but the one note.
    [`find(?h, [?h, "name", ?n], not([?h, "instance", @note])) | size`, stored.length - 1],
  ];

  for (const [text, value] of texts)
    test(text, async () => {
      const { stores, heads } = await storeOf(stored);
      expect(await evaluate(toRead(syntax(text), storedNames), stores, heads)).toMatchObject({ value });
    });
});
