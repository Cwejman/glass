// The engine over stores in memory, and, last, over the real stores in the repository.

import { describe, expect, test } from "bun:test";
import { memoryFiles } from "../integrations/glass/files.ts";
import { act, commit, idAt, nextId, openStore, type Holon, type Store } from "../integrations/glass/store.ts";
import { openStores } from "../stores.ts";
import { startEngine, type Engine } from "./engine.ts";
import { gather, groups, level, type Expression, type Grouped } from "./expression.ts";
import { fieldOf } from "./field.ts";
import { bodyProblem, mouldProblem, type Mould } from "./moulds.ts";
import { partsOf, references } from "./references.ts";

// A small pulled store: types, and a brief holding a paragraph that holds words,
// the brief pointing at a note.
let next = idAt(Date.parse("2026-01-01T00:00:00Z"));
const mint = () => {
  const made = next;
  next = nextId(made);
  return made;
};

const typeBrief = mint();
const typeParagraph = mint();
const typeWord = mint();
const typeNote = mint();
const typeFunction = mint();
const brief = mint();
const paragraph = mint();
const wordA = mint();
const wordB = mint();
const lexeme = mint();
const note = mint();
const fn = Object.fromEntries(
  [
    "everything",
    "type",
    "children",
    "parents",
    "points",
    "pointers",
    "search",
    "named",
    "store",
    "types",
    "and",
    "or",
    "not",
    "group",
    "flat",
    "since",
  ].map((native) => [native, mint()]),
);
const ownFn = mint();

const says = (shape: unknown, more = {}) => ({ says: "A field.", shape, ...more });
const takes: Record<string, string[]> = {
  type: ["set"],
  children: ["set"],
  parents: ["set"],
  points: ["set"],
  pointers: ["set"],
  search: ["words"],
  named: ["words"],
  store: ["store"],
  and: ["set", "sets"],
  or: ["set", "sets"],
  not: ["set"],
  group: ["set", "axis"],
  flat: ["set"],
  since: ["store", "words"],
};

const pulledHolons: Holon[] = [
  {
    id: typeBrief,
    instance: [],
    name: "brief",
    mould: { prose: says({ list: "ref" }, { holds: true }), about: says("ref", { optional: true }) },
    body: {},
  },
  {
    id: typeParagraph,
    instance: [],
    name: "paragraph",
    mould: { words: says({ list: "ref" }, { holds: true }) },
    body: {},
  },
  {
    id: typeWord,
    instance: [],
    name: "word",
    mould: { text: says("string"), lexeme: says("ref") },
    body: {},
  },
  { id: typeNote, instance: [], name: "note", mould: { title: says("string") }, body: {} },
  {
    id: typeFunction,
    instance: [],
    name: "function",
    mould: {
      native: says("string", { optional: true }),
      gives: says("expression", { optional: true }),
      takes: says({ list: "string" }, { optional: true }),
    },
    body: {},
  },
  {
    id: brief,
    instance: [typeBrief],
    name: "A brief",
    body: { prose: [{ $ref: paragraph }], about: { $ref: note } },
  },
  { id: paragraph, instance: [typeParagraph], body: { words: [{ $ref: wordA }, { $ref: wordB }] } },
  { id: wordA, instance: [typeWord], body: { text: "Plain", lexeme: { $ref: lexeme } } },
  { id: wordB, instance: [typeWord], body: { text: "words", lexeme: { $ref: lexeme } } },
  { id: lexeme, instance: [typeWord], body: { text: "word", lexeme: { $ref: lexeme } } },
  { id: note, instance: [typeNote], name: "A note", body: { title: "Standing apart" } },
  ...Object.entries(fn).map(([native, id]) => ({
    id,
    instance: [typeFunction],
    name: native,
    body: { native, ...(takes[native] ? { takes: takes[native] } : {}) },
  })),
  {
    id: ownFn,
    instance: [typeFunction],
    name: "Briefs",
    body: { gives: { call: { $ref: fn.type! }, with: [{ $ref: typeBrief }] } },
  },
];

const call = (native: string, ...given: (Expression | string)[]): Expression => ({
  call: { $ref: fn[native]! },
  ...(given.length ? { with: given } : {}),
});

async function pulledStore() {
  const { store } = await commit(await openStore(memoryFiles()), { holons: pulledHolons, says: "pulled" });
  return store;
}

async function started() {
  const pulled = await pulledStore();
  const engine = startEngine([{ key: "home", store: await openStore(memoryFiles()), write: true }]);

  await engine.attach("pulled", pulled);
  return { engine, pulled };
}

const homeHolon = (engine: Engine, id: string) => engine.read({ holon: id });

describe("references", () => {
  test("a reference holds as it says, or as the mould says", () => {
    const mould = { parts: { holds: true } };
    const body = {
      parts: [{ $ref: wordA }, { $ref: wordB, $holds: false }],
      about: { $ref: note },
      held: { $ref: lexeme, $holds: true },
    };

    expect(references(body, mould)).toEqual([
      { id: wordA, key: "parts", holds: true },
      { id: wordB, key: "parts", holds: false },
      { id: note, key: "about", holds: false },
      { id: lexeme, key: "held", holds: true },
    ]);
  });

  test("a holon's parts are what it holds, in the order it holds them", () => {
    const body = {
      about: { $ref: note },
      prose: [
        { $ref: wordA, $holds: true },
        { $ref: wordB, $holds: true },
      ],
    };

    expect(partsOf(body)).toEqual([wordA, wordB]);
  });
});

describe("moulds", () => {
  const mould: Mould = {
    title: { says: "Its title.", shape: "string" },
    items: { says: "Its items.", shape: { list: "ref" }, optional: true },
    span: { says: "From and to.", shape: { from: "ref", to: "ref" }, optional: true },
  };

  test("a body is held against its types", () => {
    expect(bodyProblem({ title: "x" }, [mould])).toBeUndefined();
    expect(bodyProblem({ title: "x", items: [{ $ref: note }] }, [mould])).toBeUndefined();
    expect(
      bodyProblem({ title: "x", span: { from: { $ref: note }, to: { $ref: note } } }, [mould]),
    ).toBeUndefined();

    expect(bodyProblem({}, [mould])).toContain("title is missing");
    expect(bodyProblem({ title: 1 }, [mould])).toContain("title is not string");
    expect(bodyProblem({ title: "x", extra: 1 }, [mould])).toContain("extra is not a field");
    expect(bodyProblem({ title: "x", items: "no" }, [mould])).toContain("items is not a list");
    expect(bodyProblem({ title: "x", items: ["no"] }, [mould])).toContain("items[0] is not ref");
  });

  test("a list may hold one item twice, a set may not", () => {
    const both: Mould = {
      order: { says: "In order.", shape: { list: "ref" } },
      among: { says: "Each once.", shape: { set: "ref" } },
    };
    const twice = [{ $ref: note }, { $ref: note }];

    expect(bodyProblem({ order: twice, among: [{ $ref: note }] }, [both])).toBeUndefined();
    expect(bodyProblem({ order: [], among: twice }, [both])).toContain("among[1] is already in the set");
    expect(bodyProblem({ order: [], among: "no" }, [both])).toContain("among is not a set");
  });

  test("a mould says each field in prose, with a shape there is", () => {
    expect(mouldProblem(mould)).toBeUndefined();
    expect(mouldProblem({ a: { shape: "string" } })).toContain("says nothing");
    expect(mouldProblem({ a: { says: "x", shape: "nonsense" } })).toContain("no shape");
    expect(mouldProblem("no")).toContain("a set of fields");
  });
});

describe("expressions", () => {
  const all = async () => fieldOf([{ key: "pulled", store: await pulledStore() }]).everything();

  test("sets compose", async () => {
    const a = await all();

    expect(gather(a, { $ref: note })).toEqual([note]);
    expect(gather(a, { $ref: "0".repeat(15) })).toEqual([]);
    expect(gather(a, call("type", { $ref: typeNote }))).toEqual([note]);
    expect(gather(a, call("children", { $ref: brief }))).toEqual([paragraph]);
    expect(gather(a, call("parents", { $ref: paragraph }))).toEqual([brief]);
    expect(gather(a, call("points", { $ref: brief }))).toEqual([note]);
    expect(gather(a, call("pointers", { $ref: note }))).toEqual([brief]);
    expect(
      gather(
        a,
        call("and", call("type", { $ref: typeNote }), call("not", call("type", { $ref: typeBrief }))),
      ),
    ).toEqual([note]);
    expect(gather(a, call("or", { $ref: note }, { $ref: brief })).sort()).toEqual([brief, note].sort());
    expect(gather(a, call("store", "pulled")).length).toBe(pulledHolons.length);
    expect(gather(a, call("types")).length).toBe(5);
  });

  test("a search lands on what holds the words, never a word itself", async () => {
    const a = await all();

    expect(gather(a, call("search", "plain words"))).toEqual([paragraph]);
    expect(gather(a, call("search", "standing"))).toEqual([note]);
    expect(gather(a, call("search", "nowhere to be found"))).toEqual([]);
  });

  test("what a holon is called is found by its name alone", async () => {
    const a = await all();

    expect(gather(a, call("named", "note a"))).toEqual([note]);
    expect(gather(a, call("named", "standing"))).toEqual([]);
  });

  test("a function of one's own stands beside the natives", async () => {
    expect(gather(await all(), { call: { $ref: ownFn } })).toEqual([brief]);
  });

  test("what is wrongly called says so", async () => {
    const a = await all();

    expect(() => gather(a, { arg: 0 })).toThrow("an argument");
    expect(() => gather(a, call("type"))).toThrow("takes set");
    expect(() => gather(a, call("store", { $ref: note }))).toThrow("takes a store");
    expect(() => gather(a, { call: { $ref: note } })).toThrow("not a function");
    expect(() => gather(a, call("group", { $ref: note }, "colour"))).toThrow("groups by");
  });

  test("a grouping gives collections that open as places of their own", async () => {
    const a = await all();
    const grouped = groups(a, call("group", call("not", call("types")), "type")) as Grouped;

    expect(grouped.by).toBe("type");
    expect(grouped.groups.map(({ count }) => count)).toEqual(
      grouped.groups.map(({ count }) => count).sort((x, y) => y - x),
    );

    const notes = grouped.groups.find(({ value }) => value === typeNote)!;

    expect(notes.count).toBe(1);
    expect(gather(a, notes.gathers)).toEqual([note]);
    expect(groups(a, { $ref: note })).toBe(null);
  });

  test("a set looked at is seen at its level, what nothing in it holds", async () => {
    const a = await all();
    const set = call("or", ...[brief, paragraph, wordA, note].map(($ref) => ({ $ref })));

    expect(level(a, set).sort()).toEqual([brief, note].sort());
    expect(gather(a, set)).toContain(wordA);
  });

  test("Flat is the deliberate way to see all of a set", async () => {
    const a = await all();
    const set = call("or", ...[brief, paragraph, wordA, note].map(($ref) => ({ $ref })));

    expect(level(a, call("flat", set)).sort()).toEqual([brief, paragraph, wordA, note].sort());
  });

  test("a set with nothing held within it is all its own level", async () => {
    const a = await all();
    const words = call("type", { $ref: typeWord });

    expect(level(a, words).sort()).toEqual(gather(a, words).sort());
  });

  test("a store looked at is seen at its level", async () => {
    const a = await fieldOf([
      { key: "pulled", store: await pulledStore() },
      { key: "other", store: await openStore(memoryFiles()) },
    ]).everything();

    expect(groups(a, call("everything"))).toBe(null);

    const pulled = call("store", "pulled");

    expect(gather(a, pulled)).toContain(wordA);
    expect(level(a, pulled)).toContain(brief);
    expect(level(a, pulled)).not.toContain(wordA);
  });

  test("a grouping takes an axis chosen; none is chosen for it", async () => {
    const a = await all();

    expect(() => gather(a, call("group", call("types"), "auto"))).toThrow("groups by");
    expect(
      (groups(a, call("group", call("store", "pulled"), "parent")) as Grouped).groups.some(
        ({ value }) => value === paragraph,
      ),
    ).toBe(true);
  });
});

describe("the engine", () => {
  test("since gives the holons a store's commits wrote after a moment, as its log says", async () => {
    const was = pulledHolons.find(({ id }) => id === note)!;
    const { store } = await commit(await pulledStore(), {
      holons: [{ ...was, body: { title: "Moved" } }],
      says: "the note said again",
      at: "2999-01-01T00:00:00.000Z",
    });
    const engine = startEngine([{ key: "home", store: await openStore(memoryFiles()), write: true }]);
    await engine.attach("pulled", store);

    const since = (moment: string) => engine.read({ value: call("since", "pulled", moment) });

    expect(await since("2998-01-01T00:00:00.000Z")).toEqual([{ $ref: note }]);
    expect(((await since("2000-01-01T00:00:00.000Z")) as unknown[]).length).toBe(pulledHolons.length);
    expect(await since("3000-01-01T00:00:00.000Z")).toEqual([]);
    expect(await engine.read({ gather: call("since", "pulled", "2998-01-01T00:00:00.000Z") })).toEqual([
      note,
    ]);
    expect(await engine.read({ value: call("since", "nowhere", "2000-01-01T00:00:00.000Z") })).toEqual([]);
  });

  test("a holon is read with its store, block and types' names", async () => {
    const { engine } = await started();
    const read = await homeHolon(engine, brief);

    expect(read?.store).toBe("pulled");
    expect(read?.types).toEqual(["brief"]);
    expect(read?.name).toBe("A brief");
    expect(await homeHolon(engine, "0".repeat(15))).toBe(null);
  });

  test("a whole is one read, down its holdings and not its pointings", async () => {
    const { engine } = await started();
    const { root, holons } = await engine.read({ whole: brief });

    expect(root).toBe(brief);
    expect(Object.keys(holons).sort()).toEqual([brief, paragraph, wordA, wordB].sort());
  });

  test("a whole read to a depth is one level of the holarchy", async () => {
    const { engine } = await started();
    const { holons } = await engine.read({ whole: brief, depth: 1 });

    expect(Object.keys(holons).sort()).toEqual([brief, paragraph].sort());
  });

  test("a whole can stop at what it is told, read but not gone into", async () => {
    const { engine } = await started();
    const { holons } = await engine.read({ whole: brief, stop: ["paragraph"] });

    expect(Object.keys(holons).sort()).toEqual([brief, paragraph].sort());
  });

  test("reading one holon fetches one block, and nothing of what stands beside it", async () => {
    const pulled = await pulledStore();
    const files = pulled.files as ReturnType<typeof memoryFiles>;
    const asked: string[] = [];
    const counting = { ...files, read: (path: string) => (asked.push(path), files.read(path)) };
    const engine = startEngine([{ key: "home", store: await openStore(memoryFiles()), write: true }]);

    await engine.attach("pulled", await openStore(counting));
    await engine.read({ holon: note });

    expect(asked.filter((path) => path.startsWith("blocks/")).length).toBe(1);
  });

  test("a commit lands in the home, with handles given names as it lands", async () => {
    const { engine } = await started();
    const { ids } = await engine.commit({
      holons: [
        { id: "~a", instance: [typeNote], name: "Mine", body: { title: "First" } },
        { id: "~b", instance: [typeBrief], body: { prose: [{ $ref: "~a" }], about: { $ref: note } } },
      ] as Holon[],
    });

    const mine = await homeHolon(engine, ids["~a"]!);
    const holder = await homeHolon(engine, ids["~b"]!);

    expect(mine?.store).toBe("home");
    expect(mine?.name).toBe("Mine");
    expect(holder?.body.prose).toEqual([{ $ref: ids["~a"]! }]);

    expect(await engine.read({ named: "Mine", store: "home" })).toEqual([ids["~a"]!]);
  });

  test("a commit is judged, and nothing lands when it is wrong", async () => {
    const { engine } = await started();

    await expect(
      engine.commit({ holons: [{ id: note, instance: [typeNote], body: { title: "Taken" } }] }),
    ).rejects.toThrow("only read");
    await expect(
      engine.commit({ holons: [{ id: "~a", instance: [], body: {} }] as Holon[] }),
    ).rejects.toThrow("instance of nothing");
    await expect(
      engine.commit({ holons: [{ id: "~a", instance: [note], body: {} }] as Holon[] }),
    ).rejects.toThrow("not a type");
    await expect(
      engine.commit({ holons: [{ id: "~a", instance: [typeNote], body: { title: 1 } }] as Holon[] }),
    ).rejects.toThrow("not string");
    await expect(
      engine.commit({
        holons: [{ id: "~a", instance: [typeNote], body: { title: "x", more: 1 } }] as Holon[],
      }),
    ).rejects.toThrow("not a field");
    await expect(
      engine.commit({
        holons: [{ id: "~a", instance: [typeBrief], body: { prose: [{ $ref: "0".repeat(15) }] } }] as Holon[],
      }),
    ).rejects.toThrow("not in the field");
    await expect(
      engine.commit({
        holons: [{ id: "~a", instance: [typeBrief], body: { prose: [{ $ref: "~z" }] } }] as Holon[],
      }),
    ).rejects.toThrow("names nothing");
    await expect(
      engine.commit({
        holons: [{ id: "~a", instance: [], mould: { a: { shape: "string" } }, body: {} }] as Holon[],
      }),
    ).rejects.toThrow("says nothing");

    expect(await engine.read({ log: "home" })).toEqual([]);
  });

  test("nothing left may point at what a commit takes out", async () => {
    const { engine } = await started();
    const { ids } = await engine.commit({
      holons: [
        { id: "~a", instance: [typeNote], body: { title: "One" } },
        { id: "~b", instance: [typeBrief], body: { prose: [{ $ref: "~a" }] } },
      ] as Holon[],
    });

    await expect(engine.commit({ holons: [], gone: [ids["~a"]!] })).rejects.toThrow("still refers");

    await engine.commit({ holons: [], gone: [ids["~a"]!, ids["~b"]!] });
    expect(await homeHolon(engine, ids["~a"]!)).toBe(null);
  });

  test("text may begin as it likes, and only names are handles", async () => {
    const { engine } = await started();
    const { ids } = await engine.commit({
      holons: [
        { id: "~1", instance: [typeNote], name: "~odd", body: { title: "~1" } },
        { id: "~2", instance: [typeNote], body: { title: "~5 km" } },
      ] as Holon[],
    });

    expect(await homeHolon(engine, ids["~1"]!)).toMatchObject({ name: "~odd", body: { title: "~1" } });
    expect(await homeHolon(engine, ids["~2"]!)).toMatchObject({ body: { title: "~5 km" } });
  });

  test("a reference must lead to a holon, not only to a moment some store holds", async () => {
    const { engine } = await started();
    const madeUp = nextId(nextId(ownFn));

    await expect(
      engine.commit({
        holons: [{ id: "~a", instance: [typeBrief], body: { prose: [{ $ref: madeUp }] } }] as Holon[],
      }),
    ).rejects.toThrow("not in the field");
  });

  test("a type cannot be taken out from under its instances", async () => {
    const { engine } = await started();
    const says = { a: { says: "A field.", shape: "string", optional: true } };
    const { ids } = await engine.commit({
      holons: [
        { id: "~t", instance: [], name: "kind of mine", mould: says, body: {} },
        { id: "~i", instance: ["~t"], body: {} },
      ] as Holon[],
    });

    await expect(engine.commit({ holons: [], gone: [ids["~t"]!] })).rejects.toThrow("still refers");
  });

  test("a failure to read is not kept", async () => {
    const pulled = await pulledStore();
    const files = pulled.files as ReturnType<typeof memoryFiles>;
    let down = false;
    const flaky = {
      ...files,
      read: (path: string) =>
        down && path.startsWith("blocks/")
          ? Promise.reject(new Error("the network is down"))
          : files.read(path),
    };
    const engine = startEngine([{ key: "home", store: await openStore(memoryFiles()), write: true }]);

    await engine.attach("pulled", await openStore(flaky));

    down = true;
    await expect(engine.read({ named: "A note", store: "pulled" })).rejects.toThrow("network");

    down = false;
    expect(await engine.read({ named: "A note", store: "pulled" })).toEqual([note]);
  });

  test("a holon two stores keep is read from the first, and resides in both", async () => {
    const pulled = await pulledStore();
    const other = await pulledStore();
    const engine = startEngine([{ key: "home", store: await openStore(memoryFiles()), write: true }]);

    await engine.attach("first", pulled);
    await engine.attach("second", other);

    expect((await engine.read({ holon: note }))?.store).toBe("first");
    expect(await engine.read({ named: "A note", store: "second" })).toEqual([note]);
    expect((await engine.read({ gather: call("store", "first") })).length).toBe(pulledHolons.length);
    // It resides in both, none first: read from the first, found in each.
    expect((await engine.read({ gather: call("store", "second") })).length).toBe(pulledHolons.length);
  });

  test("the field changes with a commit, and listeners hear of it", async () => {
    const { engine } = await started();
    let told = 0;
    const stop = engine.onChange(() => told++);

    await engine.read({ gather: call("everything") });
    const before = (await engine.read({ gather: call("everything") })).length;

    const { ids } = await engine.commit({
      holons: [{ id: "~a", instance: [typeNote], body: { title: "New" } }] as Holon[],
    });

    expect(told).toBe(1);
    expect(await engine.read({ gather: call("everything") })).toContain(ids["~a"]!);
    expect((await engine.read({ gather: call("everything") })).length).toBe(before + 1);

    stop();
    await engine.commit({
      holons: [{ id: "~b", instance: [typeNote], body: { title: "Unheard" } }] as Holon[],
    });
    expect(told).toBe(1);
  });

  test("an edit is a new version, its history readable", async () => {
    const { engine } = await started();
    const { ids } = await engine.commit({
      holons: [{ id: "~a", instance: [typeNote], body: { title: "One" } }] as Holon[],
    });
    const id = ids["~a"]!;

    await engine.commit({ holons: [{ id, instance: [typeNote], body: { title: "Two" } }] });

    expect((await homeHolon(engine, id))?.body.title).toBe("Two");
    expect((await engine.read({ versions: id })).map(({ body }) => body.title)).toEqual(["Two", "One"]);
    expect((await engine.read({ log: "home" }))?.length).toBe(2);
  });

  test("the same store cannot be attached twice under one key", async () => {
    const { engine, pulled } = await started();
    await expect(engine.attach("pulled", pulled)).rejects.toThrow("already attached");
  });
});

describe("attachments", () => {
  const empty = () => openStore(memoryFiles());
  const noteOf = (id: string, title: string): Holon => ({ id, instance: [typeNote], body: { title } });

  async function engineOf(...writable: string[]) {
    const stores = await Promise.all(
      writable.map(async (key) => ({ key, store: await empty(), write: true })),
    );
    return startEngine([...stores, { key: "pulled", store: await pulledStore() }]);
  }

  const storeOf = async (engine: Engine, id: string) => (await engine.read({ holon: id }))?.store;

  test("an engine keeps no store of its own, and writes only where it was let", async () => {
    const engine = startEngine([{ key: "pulled", store: await pulledStore() }]);

    expect((await engine.read({ holon: note }))?.store).toBe("pulled");
    await expect(engine.commit({ holons: [noteOf("~1", "nowhere")] })).rejects.toThrow("into which store");
    await expect(engine.commit({ holons: [noteOf(note, "edited")] })).rejects.toThrow("only read");
  });

  test("a holon nothing holds goes where the commit says, or to the one store that may be written", async () => {
    const one = await engineOf("a");
    const { ids } = await one.commit({ holons: [noteOf("~1", "into a")] });
    expect(await storeOf(one, ids["~1"]!)).toBe("a");

    const two = await engineOf("a", "b");
    await expect(two.commit({ holons: [noteOf("~1", "where")] })).rejects.toThrow("into which store");

    const into = await two.commit({ holons: [noteOf("~1", "into b")], into: "b" });
    expect(await storeOf(two, into.ids["~1"]!)).toBe("b");
  });

  test("a new holon resides where the whole that holds it is", async () => {
    const engine = await engineOf("a", "b");
    const whole = (
      await engine.commit({
        holons: [{ id: "~whole", instance: [typeBrief], body: { prose: [] } }],
        into: "b",
      })
    ).ids["~whole"]!;

    const { ids } = await engine.commit({
      holons: [
        { id: whole, instance: [typeBrief], body: { prose: [{ $ref: "~part" }] } },
        { id: "~part", instance: [typeParagraph], body: { words: [{ $ref: wordA }] } },
      ],
    });

    expect(await storeOf(engine, ids["~part"]!)).toBe("b");
  });

  test("a commit that changes nothing, or writes where it may not, is refused, and the engine goes on", async () => {
    const engine = await engineOf("a");
    let heard = 0;
    engine.onChange(() => heard++);

    await expect(engine.commit({ holons: [] })).rejects.toThrow("changes nothing");
    await expect(engine.commit({ holons: [noteOf(note, "edited")] })).rejects.toThrow(
      "belongs to pulled, which is only read",
    );
    await expect(engine.commit({ holons: [noteOf("~1", "x")], into: "pulled" })).rejects.toThrow(
      "cannot go into pulled",
    );
    expect(heard).toBe(0);

    const { ids } = await engine.commit({ holons: [noteOf("~1", "after")] });
    expect(await storeOf(engine, ids["~1"]!)).toBe("a");
  });

  test("an edit is written where the holon is kept, as one act in every store it touches", async () => {
    const engine = await engineOf("a", "b");
    const inA = (await engine.commit({ holons: [noteOf("~1", "a")], into: "a" })).ids["~1"]!;
    const inB = (await engine.commit({ holons: [noteOf("~1", "b")], into: "b" })).ids["~1"]!;

    const { commit: done } = await engine.commit({
      holons: [noteOf(inA, "a again"), noteOf(inB, "b again")],
    });
    const lastAct = async (key: string) =>
      ((await engine.read({ log: key })) as { act: string }[]).at(-1)!.act;

    expect(await lastAct("a")).toBe(done);
    expect(await lastAct("b")).toBe(done);
    expect((await engine.read({ holon: inA }))?.body.title).toBe("a again");
  });

  test("a holon kept in two stores is written in both", async () => {
    const shared = noteOf(idAt(Date.parse("2026-11-11T00:00:00Z"), 0), "shared");
    const { stores } = await act(
      [
        { store: await empty(), holons: [shared] },
        { store: await empty(), holons: [shared] },
      ],
      { says: "kept in both" },
    );
    const engine = startEngine([
      { key: "a", store: stores[0]!, write: true },
      { key: "b", store: stores[1]!, write: true },
      { key: "pulled", store: await pulledStore() },
    ]);

    await engine.commit({ holons: [noteOf(shared.id, "said again")] });

    for (const store of [stores[0]!, stores[1]!]) {
      const now = await openStore(store.files);
      expect((await now.read(shared.id))?.version.body.title).toBe("said again");
    }
  });

  test("a holon nothing holds, landing in a store with a root, joins what the root holds", async () => {
    const at = Date.parse("2026-11-11T00:00:00Z");
    const storeType: Holon = {
      id: idAt(at, 0),
      instance: [],
      name: "store",
      mould: { contents: { says: "What it holds.", shape: { set: "ref" }, holds: true } },
      body: {},
    };
    const root: Holon = {
      id: idAt(at, 1),
      instance: [storeType.id],
      name: "a",
      body: { contents: [{ $ref: storeType.id }] },
    };
    const { store } = await commit(await empty(), { holons: [storeType, root], says: "rooted" });
    const engine = startEngine([
      { key: "a", store, write: true },
      { key: "pulled", store: await pulledStore() },
    ]);

    const { ids } = await engine.commit({ holons: [noteOf("~1", "loose")] });
    const contents = (await engine.read({ holon: root.id }))!.body.contents as { $ref: string }[];

    expect(contents.map(({ $ref }) => $ref)).toEqual([storeType.id, ids["~1"]!]);
  });

  test("a store only read is taken again as it now stands, and one written never is", async () => {
    const engine = await engineOf("a");
    let heard = 0;
    engine.onChange(() => heard++);

    const { store: newer } = await commit(await pulledStore(), {
      holons: [noteOf(note, "published since")],
      says: "published since",
    });
    await engine.renew("pulled", newer);

    expect((await engine.read({ holon: note }))?.body.title).toBe("published since");
    expect(heard).toBe(1);
    await expect(engine.renew("a", newer)).rejects.toThrow("is written here");
  });

  test("what goes leaves every store that keeps it, and nothing left may point at it", async () => {
    const engine = await engineOf("a");
    const kept = (await engine.commit({ holons: [noteOf("~1", "to go")] })).ids["~1"]!;
    const pointing = await engine.commit({
      holons: [{ id: "~1", instance: [typeBrief], body: { prose: [], about: { $ref: kept } } }],
    });

    await expect(engine.commit({ holons: [], gone: [kept] })).rejects.toThrow("would be gone");
    await engine.commit({ holons: [], gone: [kept, pointing.ids["~1"]!] });
    expect(await engine.read({ holon: kept })).toBe(null);
  });
});

// Real usage: the stores this repository holds, through the same code.
describe("the real stores", async () => {
  const engine = startEngine([{ key: "home", store: await openStore(memoryFiles()), write: true }]);
  const opened: Record<string, Store> = await openStores();

  for (const [key, store] of Object.entries(opened)) await engine.attach(key, store);

  const wikiRoot = "The primitives";

  test("the site's start offers every other store and names an entry in the field", async () => {
    const [startId] = await engine.read({ named: "start", store: "site" });
    const start = await engine.read({ holon: startId! });
    const offered = (start!.body.attachments as { key: string }[]).map(({ key }) => key).sort();

    expect(offered).toEqual(
      Object.keys(opened)
        .filter((key) => key !== "site")
        .sort(),
    );
    expect((await engine.read({ holon: (start!.body.entry as { $ref: string }).$ref }))?.name).toBe("entry");
  });

  test("every store has one root, and a store at its level is its root alone", async () => {
    const named = await Promise.all(
      (await engine.read({ named: "store", store: "glass" })).map((id) => engine.read({ holon: id })),
    );
    const storeType = named.find((holon) => holon?.mould)!.id;
    const storeFn = named.find((holon) => holon?.types.includes("function"))!.id;
    const roots = await Promise.all(
      (await engine.read({ instances: storeType })).map((id) => engine.read({ holon: id })),
    );

    for (const key of Object.keys(opened)) {
      const own = roots.filter((root) => root?.store === key);

      expect(own.length).toBe(1);
      expect(await engine.read({ level: { call: { $ref: storeFn }, with: [key] } })).toEqual([own[0]!.id]);
    }
  });

  test("a function of one's own that holds a pattern gathers as the interface asks it", async () => {
    const [awaiting] = await engine.read({ named: "awaiting", store: "main" });
    const asked = { call: { $ref: awaiting! } };

    const gathered = await engine.read({ gather: asked });
    const level = await engine.read({ level: asked });

    expect(gathered.length).toBeGreaterThan(0);
    expect(level).toEqual(gathered);
  });

  test("every holon judged sound against its types", async () => {
    const all = await fieldOf(Object.entries(opened).map(([key, store]) => ({ key, store }))).everything();
    const wrong: string[] = [];

    for (const { holon } of all.known.values()) {
      const moulds = holon.instance.map((type) => all.known.get(type)?.holon.mould as Mould | undefined);

      if (moulds.some((mould) => !mould)) wrong.push(`${holon.id}: no type`);
      else if (holon.mould && mouldProblem(holon.mould))
        wrong.push(`${holon.name}: ${mouldProblem(holon.mould)}`);
      else if (moulds.length) {
        const problem = bodyProblem(holon.body, moulds as Mould[]);
        if (problem) wrong.push(`${holon.name ?? holon.id}: ${problem}`);
      }
    }

    expect(wrong.slice(0, 20)).toEqual([]);
  });

  test("a brief is read as one whole", async () => {
    const [id] = await engine.read({ named: wikiRoot, store: "main" });
    const { holons } = await engine.read({ whole: id! });

    expect(Object.keys(holons).length).toBeGreaterThan(1000);
    expect(new Set(Object.values(holons).flatMap(({ types }) => types)).has("word")).toBe(true);
  });

  test("no two stores claim one holon", async () => {
    const all = await fieldOf(Object.entries(opened).map(([key, store]) => ({ key, store }))).everything();
    const total = (
      await Promise.all(Object.values(opened).map(async (store) => (await store.all()).size))
    ).reduce((a, b) => a + b, 0);

    expect(all.known.size).toBe(total);
  });
});
