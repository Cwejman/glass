// A store a commit changed has its index patched by what changed: the holons whose
// version, whose types or whose claim changed are said again, and nothing else; and the
// patched index answers exactly as one built fresh, in the same order. Through the
// engine: what it answers after stores change under it, in the same order, is what an
// engine started fresh over them answers.

import { describe, expect, test } from "bun:test";
import { memoryFiles } from "../integrations/glass/files.ts";
import { commit, openStore, type Holon, type Store } from "../integrations/glass/store.ts";
import { namesAsked } from "../language/names.ts";
import { parse } from "../language/text.ts";
import { openStores } from "../stores.ts";
import { startEngine, type Engine } from "./engine.ts";
import { fieldOf, type Field } from "./field.ts";
import { indexOf, mouldIn, type Asked } from "./facts.ts";
import type { Everything } from "./expression.ts";
import { howIndexed, storeIndexesOf } from "./kernel.ts";

// glass, for the functions a pattern is asked with.
const { glass } = await openStores();

// An engine over the stores given, each only read, so a host renews it as it changes.
const engineOver = (given: Record<string, Store>) =>
  startEngine(Object.entries({ glass, ...given }).map(([key, store]) => ({ key, store })));

// Asking, in the language, as engine/ask.ts does.
async function ask(engine: Engine, text: string) {
  return engine.read({ value: parse(text, await namesAsked(engine.read, text)) });
}

// Every way of asking the facts of the stores given: each order an index keeps, and the
// words its strings say.
const askings = (keys: string[]) => [
  ...keys.flatMap((key) => [
    `find({e: ?e, a: ?a, v: ?v}, [?e, "store", "${key}"], [?e, ?a, ?v])`,
    `find({e: ?e, a: ?a, v: ?v}, [?v, "store", "${key}"], [?e, ?a, ?v])`,
    ...["$holds", "says", "instance", "about", "store", "tags"].map(
      (a) => `find({e: ?e, v: ?v}, [?e, "store", "${key}"], [?e, "${a}", ?v])`,
    ),
    `find({e: ?e, w: ?w}, [?e, "store", "${key}"], said(?e, "says", ?w))`,
    `find({e: ?e, w: ?w}, [?e, "store", "${key}"], said(?e, "tags", ?w))`,
  ]),
  `find(?e, said(?e, "says", "note"))`,
  `find(?e, said(?e, "says", "again"))`,
  `find(?e, [?e, "tags", "red"])`,
];

// What an engine answers, held against an engine started fresh over the same stores.
async function answersAsFresh(engine: Engine, given: Record<string, Store>) {
  const fresh = engineOver(given);

  for (const text of askings(Object.keys(given))) {
    const expression = parse(text, await namesAsked(engine.read, text));
    expect(await engine.read({ value: expression })).toEqual(await fresh.read({ value: expression }));
  }
}

// What the engine has asked of every store, the words too, so each is indexed before it
// changes.
const askedOf = (engine: Engine, keys: string[]) =>
  Promise.all(askings(keys).map((text) => ask(engine, text)));

// Everything asked of an index, each order and the words, held against a fresh index.
function indexAsFresh(all: Everything, key: string) {
  const held = all.held.get(key)!;
  const also = new Set(held.filter((each) => all.known.get(each.holon.id) !== each));
  const fresh = indexOf(held, mouldIn(all.known), also);
  const index = storeIndexesOf(all).get(key)!;
  const ids = held.map(({ holon }) => holon.id);

  const asked: Asked[] = [
    {},
    { a: "$holds" },
    { a: "says" },
    { a: "instance" },
    { a: "about" },
    { a: "store" },
    { a: "says", words: true },
    { a: "says", v: "note", words: true },
    { a: "says", v: "again", words: true },
    { a: "tags", words: true },
    { a: "tags", v: "red" },
    ...ids.flatMap((e) => [
      { e },
      { e, a: "says" },
      { e, a: "says", words: true as const },
      { v: { $ref: e } },
    ]),
  ];

  for (const each of asked) {
    expect(index.answer(each)).toEqual(fresh.answer(each));
    expect(index.count(each)).toBe(fresh.count(each));
  }
}

const many = 40;

// A store of types, one of notes many enough that a few changed are patched, and one
// other store untouched.
async function stores() {
  const types = await openStore(memoryFiles());
  const typeNote = types.minter()();
  await commit(types, {
    says: "the type",
    holons: [
      {
        id: typeNote,
        instance: [],
        name: "note",
        mould: {
          says: { says: "What.", shape: "string" },
          tags: { says: "Its tags.", shape: "string" },
          about: { says: "Of what.", shape: "ref", holds: false },
        },
        body: {},
      },
    ],
  });

  const notes = await openStore(memoryFiles());
  const mint = notes.minter();
  const ids = Array.from({ length: many }, () => mint());
  await commit(notes, {
    says: "notes",
    holons: ids.map((id, i) => ({
      id,
      instance: [typeNote],
      body: {
        says: `note ${i} says a word`,
        tags: i % 2 ? ["red", "round"] : "blue",
        ...(i ? { about: { $ref: ids[i - 1]! } } : {}),
      },
    })),
  });

  const other = await openStore(memoryFiles());
  await commit(other, {
    says: "other",
    holons: [{ id: other.minter()(), instance: [typeNote], body: { says: "another note" } }],
  });

  return {
    typeNote,
    ids,
    types: await openStore(types.files),
    notes: await openStore(notes.files),
    other: await openStore(other.files),
  };
}

const attached = (given: Record<string, Store>) =>
  Object.entries(given).map(([key, store]) => ({ key, store: store as never }));

// A commit to a store, and the store opened again, as a host renews it.
async function committed(store: Store, holons: Holon[], gone: string[] = []) {
  await commit(await openStore(store.files), { says: "a change", holons, gone });
  return openStore(store.files);
}

async function read(store: Store, id: string): Promise<Holon> {
  const { prev: _, ...holon } = (await store.read(id))!.version;
  return holon;
}

const indexed = async (field: Field) => {
  const all = await field.everything();
  storeIndexesOf(all);
  return all;
};

test("a holon changed, one added and one gone: patched, and answering as fresh", async () => {
  const { typeNote, ids, types, notes, other } = await stores();
  const engine = engineOver({ types, notes, other });
  await askedOf(engine, ["types", "notes", "other"]);

  const changed = await read(notes, ids[3]!);
  const renewed = await committed(
    notes,
    [
      { ...changed, body: { ...changed.body, says: "said again", tags: ["red"] } },
      { id: notes.minter()(), instance: [typeNote], body: { says: "a new note", about: { $ref: ids[0]! } } },
    ],
    [ids[7]!],
  );
  await engine.renew("notes", renewed);

  await answersAsFresh(engine, { types, notes: renewed, other });
});

test("several commits between two indexings are patched as one", async () => {
  const { ids, types, notes, other } = await stores();
  const engine = engineOver({ types, notes, other });
  await askedOf(engine, ["types", "notes", "other"]);

  let store = notes;
  for (const i of [1, 2, 1]) {
    const holon = await read(store, ids[i]!);
    store = await committed(store, [
      { ...holon, body: { ...holon.body, says: `${holon.body.says}, again` } },
    ]);
    await engine.renew("notes", store);
  }

  await answersAsFresh(engine, { types, notes: store, other });
});

test("a type whose mould changed has its instances said again; one renewed unchanged keeps them", async () => {
  const { typeNote, types, notes, other } = await stores();
  const engine = engineOver({ types, notes, other });
  await askedOf(engine, ["types", "notes", "other"]);

  const quiet = await committed(types, [{ id: types.minter()(), instance: [], name: "aside", body: {} }]);
  await engine.renew("types", quiet);
  await answersAsFresh(engine, { types: quiet, notes, other });

  const type = await read(quiet, typeNote);
  const held = await committed(quiet, [
    { ...type, mould: { ...type.mould, about: { says: "Of what, held.", shape: "ref", holds: true } } },
  ]);
  await engine.renew("types", held);

  expect(await ask(engine, `find({w: ?w, p: ?p}, [?w, "store", "notes"], [?w, "$holds", ?p])`)).toHaveLength(
    many - 1,
  );
  await answersAsFresh(engine, { types: held, notes, other });
});

test("a holon another store comes to claim, and lets go again, leaves its index and comes back", async () => {
  const { ids, types, notes, other } = await stores();
  // A store attached empty before notes, renewed as notes to claim its holons, and
  // renewed empty again to let them go.
  const empty = await openStore(memoryFiles());
  const engine = engineOver({ types, first: empty, notes, other });
  await askedOf(engine, ["types", "notes", "other"]);

  await engine.renew("first", notes);
  // What a holon says is said once, though two stores keep it.
  const plan = (await ask(engine, `explain(find(?s, [@${ids[0]}, "says", ?s]))`)) as {
    steps: { facts: number }[];
  };
  expect(plan.steps[0]!.facts).toBe(1);
  await answersAsFresh(engine, { types, first: notes, notes, other });

  await engine.renew("first", empty);
  await answersAsFresh(engine, { types, first: empty, notes, other });
});

test("a store changed in most of its holons is indexed fresh", async () => {
  const { ids, types, notes, other } = await stores();
  const engine = engineOver({ types, notes, other });
  await askedOf(engine, ["types", "notes", "other"]);

  const holons = await Promise.all(ids.map((id) => read(notes, id)));
  const renewed = await committed(
    notes,
    holons.map((holon) => ({ ...holon, body: { ...holon.body, says: "all said again" } })),
  );
  await engine.renew("notes", renewed);

  await answersAsFresh(engine, { types, notes: renewed, other });
});

describe("unit: the index's carrying (rewritten with the index)", () => {
  test("a holon changed, one added and one gone: patched, and answering as fresh", async () => {
    const { typeNote, ids, types, notes, other } = await stores();
    const before = fieldOf(attached({ types, notes, other }));
    const first = await indexed(before);
    // The words asked before the change, so what is carried of them is held as well.
    storeIndexesOf(first).get("notes")!.answer({ a: "says", words: true });

    const changed = await read(notes, ids[3]!);
    const renewed = await committed(
      notes,
      [
        { ...changed, body: { ...changed.body, says: "said again", tags: ["red"] } },
        {
          id: notes.minter()(),
          instance: [typeNote],
          body: { says: "a new note", about: { $ref: ids[0]! } },
        },
      ],
      [ids[7]!],
    );

    const after = await fieldOf(attached({ types, notes: renewed, other }), before).everything();

    expect(howIndexed(after)).toEqual(
      new Map([
        ["types", "kept"],
        ["notes", "patched"],
        ["other", "kept"],
      ]),
    );
    for (const key of ["types", "notes", "other"]) indexAsFresh(after, key);
  });

  test("several commits between two indexings are patched as one", async () => {
    const { ids, types, notes, other } = await stores();
    const before = fieldOf(attached({ types, notes, other }));
    await indexed(before);

    let store = notes;
    let field = before;
    for (const i of [1, 2, 1]) {
      const holon = await read(store, ids[i]!);
      store = await committed(store, [
        { ...holon, body: { ...holon.body, says: `${holon.body.says}, again` } },
      ]);
      field = fieldOf(attached({ types, notes: store, other }), field);
    }

    const after = await field.everything();
    expect(howIndexed(after).get("notes")).toBe("patched");
    indexAsFresh(after, "notes");
  });

  test("a type whose mould changed has its instances said again; one renewed unchanged keeps them", async () => {
    const { typeNote, types, notes, other } = await stores();
    const before = fieldOf(attached({ types, notes, other }));
    await indexed(before);

    // Another holon in the types' store, so small a store it is indexed fresh: the type
    // itself is as it was, so what is read through it keeps its index.
    const quiet = await committed(types, [{ id: types.minter()(), instance: [], name: "aside", body: {} }]);
    const unchanged = fieldOf(attached({ types: quiet, notes, other }), before);
    const all = await indexed(unchanged);
    expect(howIndexed(all)).toEqual(
      new Map([
        ["types", "fresh"],
        ["notes", "kept"],
        ["other", "kept"],
      ]),
    );

    const type = await read(quiet, typeNote);
    const held = await committed(quiet, [
      { ...type, mould: { ...type.mould, about: { says: "Of what, held.", shape: "ref", holds: true } } },
    ]);
    const after = await fieldOf(attached({ types: held, notes, other }), unchanged).everything();

    expect(storeIndexesOf(after).get("notes")!.answer({ a: "$holds" }).length).toBe(many - 1);
    for (const key of ["types", "notes", "other"]) indexAsFresh(after, key);
  });

  test("a holon another store comes to claim, and lets go again, leaves its index and comes back", async () => {
    const { types, notes, other } = await stores();
    const alone = fieldOf(attached({ types, notes, other }));
    await indexed(alone);

    const claimed = fieldOf(attached({ types, first: notes, notes, other }), alone);
    const all = await claimed.everything();
    expect(storeIndexesOf(all).get("notes")!.answer({ a: "says" })).toEqual([]);
    indexAsFresh(all, "notes");

    const free = await fieldOf(attached({ types, notes, other }), claimed).everything();
    for (const key of ["types", "notes", "other"]) indexAsFresh(free, key);
  });

  test("a store changed in most of its holons is indexed fresh", async () => {
    const { ids, types, notes, other } = await stores();
    const before = fieldOf(attached({ types, notes, other }));
    await indexed(before);

    const holons = await Promise.all(ids.map((id) => read(notes, id)));
    const renewed = await committed(
      notes,
      holons.map((holon) => ({ ...holon, body: { ...holon.body, says: "all said again" } })),
    );
    const after = await fieldOf(attached({ types, notes: renewed, other }), before).everything();

    expect(howIndexed(after).get("notes")).toBe("fresh");
    indexAsFresh(after, "notes");
  });
});
