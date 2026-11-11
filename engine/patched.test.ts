// A store a commit changed has its index patched by what changed: the holons whose
// version, whose types or whose claim changed are said again, and nothing else; and the
// patched index answers exactly as one built fresh, in the same order.

import { expect, test } from "bun:test";
import { memoryFiles } from "../integrations/glass/files.ts";
import { commit, openStore, type Holon, type Store } from "../integrations/glass/store.ts";
import { fieldOf, type Field } from "./field.ts";
import { indexOf, mouldIn, type Asked } from "./facts.ts";
import type { Everything } from "./expression.ts";
import { howIndexed, storeIndexesOf } from "./kernel.ts";

// Everything asked of an index, each order and the words, held against a fresh index.
function answersAsFresh(all: Everything, key: string) {
  const own = all.held.get(key)!.filter((each) => all.known.get(each.holon.id) === each);
  const fresh = indexOf(own, mouldIn(all.known));
  const index = storeIndexesOf(all).get(key)!;
  const ids = own.map(({ holon }) => holon.id);

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
    ...ids.flatMap((e) => [{ e }, { e, a: "says" }, { e, a: "says", words: true as const }, { v: { $ref: e } }]),
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
  const before = fieldOf(attached({ types, notes, other }));
  const first = await indexed(before);
  // The words asked before the change, so what is carried of them is held as well.
  storeIndexesOf(first).get("notes")!.answer({ a: "says", words: true });

  const changed = await read(notes, ids[3]!);
  const renewed = await committed(
    notes,
    [
      { ...changed, body: { ...changed.body, says: "said again", tags: ["red"] } },
      { id: notes.minter()(), instance: [typeNote], body: { says: "a new note", about: { $ref: ids[0]! } } },
    ],
    [ids[7]!],
  );

  const after = await fieldOf(attached({ types, notes: renewed, other }), before).everything();

  expect(howIndexed(after)).toEqual(new Map([["types", "kept"], ["notes", "patched"], ["other", "kept"]]));
  for (const key of ["types", "notes", "other"]) answersAsFresh(after, key);
});

test("several commits between two indexings are patched as one", async () => {
  const { ids, types, notes, other } = await stores();
  const before = fieldOf(attached({ types, notes, other }));
  await indexed(before);

  let store = notes;
  let field = before;
  for (const i of [1, 2, 1]) {
    const holon = await read(store, ids[i]!);
    store = await committed(store, [{ ...holon, body: { ...holon.body, says: `${holon.body.says}, again` } }]);
    field = fieldOf(attached({ types, notes: store, other }), field);
  }

  const after = await field.everything();
  expect(howIndexed(after).get("notes")).toBe("patched");
  answersAsFresh(after, "notes");
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
  expect(howIndexed(all)).toEqual(new Map([["types", "fresh"], ["notes", "kept"], ["other", "kept"]]));

  const type = await read(quiet, typeNote);
  const held = await committed(quiet, [
    { ...type, mould: { ...type.mould, about: { says: "Of what, held.", shape: "ref", holds: true } } },
  ]);
  const after = await fieldOf(attached({ types: held, notes, other }), unchanged).everything();

  expect(storeIndexesOf(after).get("notes")!.answer({ a: "$holds" }).length).toBe(many - 1);
  for (const key of ["types", "notes", "other"]) answersAsFresh(after, key);
});

test("a holon another store comes to claim, and lets go again, leaves its index and comes back", async () => {
  const { types, notes, other } = await stores();
  const alone = fieldOf(attached({ types, notes, other }));
  await indexed(alone);

  const claimed = fieldOf(attached({ types, first: notes, notes, other }), alone);
  const all = await claimed.everything();
  expect(storeIndexesOf(all).get("notes")!.answer({ a: "says" })).toEqual([]);
  answersAsFresh(all, "notes");

  const free = await fieldOf(attached({ types, notes, other }), claimed).everything();
  for (const key of ["types", "notes", "other"]) answersAsFresh(free, key);
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
  answersAsFresh(after, "notes");
});
