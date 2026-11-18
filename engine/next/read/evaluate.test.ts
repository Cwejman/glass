import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentOf, hashOf, partOf } from "../../../stores/act.ts";
import type { Act, Head, Holon, Store } from "../../../stores/store.ts";
import { folderStorage } from "../../../stores/strata/storage/folder.ts";
import { strata } from "../../../stores/strata/strata.ts";
import { evaluate } from "./evaluate.ts";
import type { Value } from "./values.ts";

const made: string[] = [];
afterAll(() => made.forEach((at) => rmSync(at, { recursive: true, force: true })));

const id = (n: number) => String(n).padStart(15, "0");
const ref = (n: number, holds = false) => (holds ? { $ref: id(n), $holds: true } : { $ref: id(n) });

// A store holding these holons, taken as one act, and its head.
async function storeOf(root: string, holons: Holon[]): Promise<{ store: Store; head: Head | null }> {
  const folder = mkdtempSync(join(tmpdir(), "glass-read-"));
  made.push(folder);
  const store = strata(folderStorage(folder));
  if (!holons.length) return { store, head: null };

  const part = partOf(holons);
  const said = {
    when: "2026-11-16T00:00:00.000Z",
    at: [] as Act["at"],
    says: "a test",
    gone: [],
    parts: [[root, part && (await hashOf(part))]] as Act["parts"],
  };
  const reply = await store.offer({
    ...said,
    hash: await hashOf(contentOf(said)),
    own: root,
    holons,
    born: holons.map((holon) => holon.id),
    over: null,
    touches: { ids: holons.map((holon) => holon.id), addresses: [] },
  });
  if (!("accepted" in reply)) throw new Error(JSON.stringify(reply));
  return { store, head: reply.accepted };
}

// The language's own store: the types function and use, the kinds of value a placeholder
// takes, and the natives these tests call.
const natives = [
  "add",
  "map",
  "get",
  "in",
  "out",
  "find",
  "said",
  "not",
  "everything",
  "log",
  "children",
  "size",
  "whole",
  "if",
  "lt",
  "mul",
  "join",
  "eq",
  "parse",
  "print",
];
const fn = (name: string) => id(10 + natives.indexOf(name));
const kinds = { value: id(3), number: id(4), string: id(5), list: id(6) };
const language: Holon[] = [
  {
    id: id(1),
    instance: [],
    name: "function",
    mould: {
      input: { says: "", shape: { list: "ref" }, holds: true, optional: true },
      native: { says: "", shape: "string", optional: true },
      body: { says: "", shape: "ref", holds: true, optional: true },
    },
    body: {},
  },
  {
    id: id(2),
    instance: [],
    name: "use",
    mould: {
      fn: { says: "", shape: "ref", optional: true },
      args: { says: "", shape: "json" },
      offer: { says: "", shape: { list: "ref" }, optional: true },
    },
    body: {},
  },
  ...Object.entries(kinds).map(([name, kind]) => ({ id: kind, instance: [], name, mould: {}, body: {} })),
  ...natives.map((name) => ({ id: fn(name), instance: [id(1)], name, body: { native: name } })),
];

// A field of two stores: notes refers into home, which holds it.
const type = { id: id(100), instance: [], name: "note", mould: {}, body: {} };
const note = { id: id(101), instance: [id(100)], name: "Notes", body: { text: "Glass holds holons" } };
const home = { id: id(200), instance: [], name: "Home", body: { parts: [ref(101, true)], see: ref(100) } };

const v = (name: string) => ({ "?": name });

// The holons a read carries, each under a handle: uses, functions held
// where they are written, and their placeholders.
type Link = { $ref: string; $holds?: boolean; $optional?: boolean };

function carried() {
  const holons: Holon[] = [];
  const handle = (holon: Omit<Holon, "id">) => {
    const made = `~${holons.length + 1}`;
    holons.push({ id: made, ...holon });
    return made;
  };

  return {
    holons,
    // A use of a native, or of any function, held where it is written.
    use: (applying: string | Link, ...args: unknown[]): Link => ({
      $ref: handle({
        instance: [id(2)],
        body: { fn: typeof applying === "string" ? { $ref: fn(applying) } : { $ref: applying.$ref }, args },
      }),
      $holds: true,
    }),
    // The same, offering holons to its function's optional placeholders.
    offering: (offer: Link[], applying: Link, ...args: unknown[]): Link => ({
      $ref: handle({ instance: [id(2)], body: { fn: { $ref: applying.$ref }, args, offer } }),
      $holds: true,
    }),
    // A placeholder of a type, pointed at from a body.
    placeholder: (type: string, name: string): Link => ({
      $ref: handle({ instance: [type], name, body: {} }),
    }),
    // A handle made ahead of its holon, for a function that uses itself.
    ahead: (): Link => ({ $ref: handle({ instance: [], body: {} }) }),
    // A function taking placeholders, giving a use; held where it is written, or kept
    // under a handle made ahead.
    function: (input: Link[], body: Link, as?: Link): Link => {
      const holon = {
        instance: [id(1)],
        body: { input: input.map((place) => ({ ...place, $holds: true })), body },
      };
      if (as) Object.assign(holons.find(({ id }) => id === as.$ref)!, holon);
      return { $ref: as?.$ref ?? handle(holon), $holds: true };
    },
  };
}

// The named holons of no type the tests stand on, and a found list of holons by id.
const untyped = [id(1), id(2), ...Object.values(kinds), id(100), id(200)].sort();
const idsOf = (found: unknown) => (found as { $ref: string }[]).map(({ $ref }) => $ref).sort();

const optional = (place: Link): Link => ({ ...place, $optional: true });
const pointer = ({ $ref }: Link) => ({ $ref });

async function field(more: { name: string; holons: Holon[] }[] = []) {
  const all = [
    { name: "glass", holons: language },
    { name: "notes", holons: [type, note] },
    { name: "home", holons: [home] },
    ...more,
  ];
  const stores = new Map<string, { store: Store }>();
  const heads: Record<string, Head | null> = {};

  // How many questions of each kind the stores were asked.
  const asked: Record<string, number> = {};

  for (const { name, holons } of all) {
    const { store, head } = await storeOf(name, holons);
    const counted: Store = {
      ...store,
      read: (head, question) => {
        const kind = Object.keys(question)[0]!;
        asked[kind] = (asked[kind] ?? 0) + 1;
        return store.read(head, question);
      },
    };
    stores.set(name, { store: counted });
    heads[name] = head;
  }

  // A read's answer, its value or its problem, and the stores it asked.
  const reading = (gives: unknown, holons: Holon[] = []) =>
    evaluate({ gives, holons }, stores, heads) as Promise<{
      value?: Value;
      problem?: string;
      asked: string[];
      diverged?: string[];
    }>;
  return Object.assign(reading, { asked });
}

describe("reading over stores", () => {
  test("values, lists and lambdas are worked out", async () => {
    const read = await field();
    const { holons, use, placeholder, function: lambda } = carried();
    const x = placeholder(kinds.number, "x");

    const gives = use("map", [1, 2, 3], lambda([x], use("add", x, x)));
    expect((await read(gives, holons)).value).toEqual([2, 4, 6]);
    expect((await read([1, { two: 2 }, gives], holons)).value).toEqual([1, { two: 2 }, [2, 4, 6]]);
  });

  test("a holon is read from the store that keeps it, and says so", async () => {
    const read = await field();
    const { holons, use } = carried();

    expect((await read(use("get", ref(101), "store"), holons)).value).toBe("notes");
    expect((await read(use("get", ref(101), "text"), holons)).value).toBe("Glass holds holons");
    expect((await read(use("get", ref(999), "text"), holons)).value).toBeNull();
    expect((await read(ref(101))).value).toEqual(ref(101));
  });

  test("a whole is read a layer at a time, each layer one question of every store", async () => {
    const read = await field();
    const { holons, use } = carried();
    const answer = await read(use("whole", ref(200)), holons);

    expect(Object.keys((answer.value as { holons: object }).holons).sort()).toEqual([id(101), id(200)]);
    expect(read.asked.holon).toBeUndefined();
    // Each turn's holons asked of all three stores together: the use's type, the function
    // and its type, then the whole, its parts and their types, six turns in all.
    expect(read.asked.holons).toBe(6 * 3);
  });

  test("an answer names the stores it asked: every store, for every holon", async () => {
    const read = await field();
    const { holons, use } = carried();

    expect((await read(1)).asked).toEqual([]);
    expect((await read(use("get", ref(101), "text"), holons)).asked.sort()).toEqual([
      "glass",
      "home",
      "notes",
    ]);
  });

  test("a holon two stores keep differently is said to have diverged", async () => {
    const read = await field([
      { name: "other", holons: [{ ...note, body: { text: "Glass is otherwise" } }] },
    ]);
    const { holons, use } = carried();

    expect(await read(use("get", ref(101), "text"), holons)).toMatchObject({
      value: "Glass holds holons",
      diverged: [id(101)],
    });
  });

  test("what refers to a holon is found in every store", async () => {
    const read = await field();
    const { holons, use } = carried();

    expect((await read(use("in", ref(101)), holons)).value).toEqual([
      { key: "parts", from: ref(200), holds: true },
    ]);
    expect((await read(use("children", ref(200)), holons)).value).toEqual([ref(101)]);
  });

  test("a pattern is joined across stores, its facts literal lists", async () => {
    const read = await field();
    const { holons, use } = carried();
    const found = use(
      "find",
      { whole: v("w"), part: v("p") },
      [v("w"), "$holds", v("p")],
      [v("p"), "instance", ref(100)],
    );

    expect((await read(found, holons)).value).toEqual([{ whole: ref(200), part: ref(101) }]);
  });

  test("a word said and not are held uses within find", async () => {
    const read = await field();
    const { holons, use } = carried();

    expect((await read(use("find", v("h"), use("said", v("h"), "text", "HOLDS")), holons)).value).toEqual([
      ref(101),
    ]);
    const others = use(
      "find",
      v("h"),
      [v("h"), "name", v("n")],
      use("not", [v("h"), "instance", ref(1)]),
      use("not", [v("h"), "instance", ref(100)]),
    );
    expect(idsOf((await read(others, holons)).value)).toEqual(untyped);
  });

  test("a test is a held use reading the pattern's variables", async () => {
    const read = await field();
    const { holons, use } = carried();
    const found = use("find", v("h"), [v("h"), "name", v("n")], use("eq", v("n"), "note"));

    expect((await read(found, holons)).value).toEqual([ref(100)]);
  });

  test("the words a holon known says are found with no word given; with neither known, it is refused", async () => {
    const read = await field();
    const { holons, use } = carried();
    const words = ["glass", "holds", "holons"];

    expect((await read(use("find", v("w"), use("said", ref(101), "text", v("w"))), holons)).value).toEqual(
      words,
    );
    const typed = use("find", v("w"), [v("h"), "instance", ref(100)], use("said", v("h"), "text", v("w")));
    expect((await read(typed, holons)).value).toEqual(words);
    expect(await read(use("find", v("w"), use("said", v("h"), "text", v("w"))), holons)).toMatchObject({
      problem: expect.stringContaining("a word known or a holon known"),
    });
  });

  test("a store not yet written holds nothing, and is asked all the same", async () => {
    const read = await field([{ name: "empty", holons: [] }]);
    const { holons, use } = carried();
    const answer = await read(use("get", ref(999), "text"), holons);

    expect(answer.value).toBeNull();
    expect(answer.asked).toContain("empty");
  });

  test("a store's log is its commits, newest first, and what would scan every holon is refused", async () => {
    const read = await field();
    const { holons, use } = carried();

    expect((await read(use("size", use("log", "notes")), holons)).value).toBe(1);
    expect((await read(use("log", "nowhere"), holons)).value).toEqual([]);
    expect((await read(use("everything"), holons)).problem).toContain("scanned every holon");
  });

  test("a function calls itself", async () => {
    const read = await field();
    const { holons, use, ahead, placeholder, function: held } = carried();
    const [factorial, n] = [ahead(), placeholder(kinds.number, "n")];
    held([n], use("if", use("lt", n, 2), 1, use("mul", n, use(factorial, use("add", n, -1)))), factorial);

    expect((await read(use(factorial, 5), holons)).value).toBe(120);
  });

  test("a function held within another closes over its placeholders", async () => {
    const read = await field();
    const { holons, use, placeholder, function: held } = carried();
    const [xs, k, x] = [
      placeholder(kinds.list, "xs"),
      placeholder(kinds.number, "k"),
      placeholder(kinds.number, "x"),
    ];
    const adding = held([xs, k], use("map", xs, held([x], use("add", x, k))));

    expect((await read(use(adding, [1, 2, 3], 10), holons)).value).toEqual([11, 12, 13]);
    expect((await read(held([x], use("add", x, 1)), holons)).value).toEqual({
      function: `~${holons.length}`,
    });
  });

  test("an optional placeholder is passed over by type, and filled by the nearest offer of its type", async () => {
    const read = await field();
    const { holons, use, offering, placeholder, function: held } = carried();
    const [shown, times] = [placeholder(id(100), "note"), placeholder(kinds.number, "times")];
    const showing = held([optional(shown), times], use("join", [use("get", shown, "text"), times], " "));

    expect((await read(offering([ref(200), ref(101)], showing, 3), holons)).value).toBe(
      "Glass holds holons 3",
    );
    expect((await read(use(showing, ref(101), 2), holons)).value).toBe("Glass holds holons 2");
    expect((await read(use(showing, 4), holons)).value).toBe("4");
  });

  test("a placeholder of the type use is given the use itself, any other what it gives", async () => {
    const read = await field();
    const { holons, use, placeholder, function: held } = carried();
    const [itself, value] = [placeholder(id(2), "u"), placeholder(kinds.value, "v")];
    const given = use("size", [1, 2]);

    expect((await read(use(held([itself], use("get", itself, "fn")), given), holons)).value).toEqual({
      $ref: fn("size"),
    });
    expect((await read(use(held([value], use("get", value, "fn")), given), holons)).value).toBeNull();
    expect((await read(pointer(given), holons)).value).toBe(2);
  });

  test("parse gives a read of uses as a value, and print, its reverse, says it again", async () => {
    const read = await field();
    const { holons, use } = carried();
    const texts = [
      "add(1, 2)",
      `map([1, 2, 3], x => add(x, mul(x, 2)))`,
      `find(?h, [?h, "name", ?n], not([?h, "instance", @${id(1)}]), eq(?n, "note"))`,
      `[@${id(101)}.text, {sum: add(1, 2)}]`,
    ];

    expect((await read(use("parse", "add(1, 2)"), holons)).value).toEqual({
      gives: { $ref: "~1", $holds: true },
      holons: [{ id: "~1", instance: [id(2)], body: { fn: { $ref: fn("add") }, args: [1, 2] } }],
    });
    for (const text of texts) expect((await read(use("print", use("parse", text)), holons)).value).toBe(text);
    expect((await read(use("parse", "add(1,"), holons)).problem).toBe(
      "an expression begins here, at 7 of “add(1,”",
    );
    expect((await read(use("print", 3), holons)).value).toBeNull();
  });
});

describe("drawing", () => {
  // The component type, and a component of it taking a number, carried by the read.
  function components() {
    const made = carried();
    const type: Holon = {
      id: "~component",
      instance: [],
      name: "component",
      mould: { input: { says: "", shape: { list: "ref" }, holds: true, optional: true } },
      body: {},
    };
    const n = made.placeholder(kinds.number, "n");
    const view: Holon = { id: "~view", instance: [type.id], body: { input: [{ ...n, $holds: true }] } };
    made.holons.push(type, view);
    const drawn = (given: Value[], at: string[]) => ({ $draw: { $ref: view.id }, given, at });

    // A component holding a body: what it gives, drawn a step further along.
    const framing = (body: unknown): Link => {
      const holon = { id: `~framing${made.holons.length}`, instance: [type.id], body: { input: [], body } };
      made.holons.push(holon);
      return { $ref: holon.id };
    };
    return { ...made, view: { $ref: view.id }, drawn, framing };
  }

  test("a component applied gives a drawing: itself, what it was given bound to its input, and where", async () => {
    const read = await field();
    const { holons, use, view, drawn } = components();
    const gives = use(view, use("add", 1, 2));

    expect((await read(gives, holons)).value).toEqual(drawn([3], [gives.$ref]));
    expect((await read([gives, 4], holons)).value).toEqual([drawn([3], [gives.$ref]), 4]);
  });

  test("a component holding a body gives what its body gives, its drawings placed a step further", async () => {
    const read = await field();
    const { holons, use, view, drawn, framing } = components();
    const [first, second] = [use(view, 1), use(view, 2)];
    const gives = use(framing([first, second]));

    expect((await read(gives, holons)).value).toEqual([
      drawn([1], [gives.$ref, first.$ref]),
      drawn([2], [gives.$ref, second.$ref]),
    ]);
  });

  test("a component applied within a lambda is placed where the lambda was written", async () => {
    const read = await field();
    const { holons, use, placeholder, function: held, view, drawn } = components();
    const x = placeholder(kinds.number, "x");
    const each = use(view, x);

    expect((await read(use("map", [1, 2], held([x], each)), holons)).value).toEqual([
      drawn([1], [each.$ref]),
      drawn([2], [each.$ref]),
    ]);
  });

  test("a use naming no function is drawn, its component null, for what draws it to find one", async () => {
    const read = await field();
    const { holons, use } = components();
    holons.push({ id: "~bare", instance: [id(2)], body: { args: [ref(101), use("add", 1, 1)] } });

    expect((await read({ $ref: "~bare" }, holons)).value).toEqual({
      $draw: null,
      given: [ref(101), 2],
      at: ["~bare"],
    });
  });

  test("a drawing is no record to the natives, and a use naming what is no function is refused", async () => {
    const read = await field();
    const { holons, use, view } = components();
    holons.push({ id: "~odd", instance: [id(2)], body: { fn: "add", args: [] } });

    expect((await read(use("get", use(view, 1), "given"), holons)).value).toBeNull();
    expect((await read({ $ref: "~odd" }, holons)).problem).toContain("names no function");
  });
});
