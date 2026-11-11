// The field's index carried from field to field: a store whose holons are carried keeps
// its index, one that changed is indexed again, and what a type is read through counts;
// whatever is carried answers as a fresh index does.

import { expect, test } from "bun:test";
import { memoryFiles } from "../integrations/glass/files.ts";
import { commit, openStore, type Holon } from "../integrations/glass/store.ts";
import { fieldOf } from "./field.ts";
import { indexOf, mouldIn } from "./facts.ts";
import type { Everything } from "./expression.ts";
import { answeringOf, storeIndexesOf } from "./kernel.ts";

// What a store's index answers, held against an index built fresh from the same field.
function answersAsFresh(all: Everything, key: string) {
  const held = all.held.get(key)!;
  const also = new Set(held.filter((each) => all.known.get(each.holon.id) !== each));
  const fresh = indexOf(held, mouldIn(all.known), also);
  const carried = storeIndexesOf(all).get(key)!;

  for (const asked of [
    { a: "$holds" },
    { a: "says" },
    { a: "instance" },
    { a: "about" },
    { a: "says", words: true as const },
  ])
    expect(carried.answer(asked)).toEqual(fresh.answer(asked));
}

// Ids each store mints, as a store gives them, taken in the first store's turn.
let typeNote = "";
let one = "";
let two = "";
const typed = (id: string, body: Holon["body"]): Holon => ({ id, instance: [typeNote], body });

async function stores() {
  const types = await openStore(memoryFiles());
  typeNote = types.minter()();
  await commit(types, {
    says: "the type",
    holons: [
      {
        id: typeNote,
        instance: [],
        name: "note",
        mould: {
          says: { says: "What.", shape: "string" },
          about: { says: "Of what.", shape: "ref", holds: false },
        },
        body: {},
      },
    ],
  });
  const notes = await openStore(memoryFiles());
  one = notes.minter()();
  await commit(notes, { holons: [typed(one, { says: "one", about: { $ref: one } })], says: "one" });
  const other = await openStore(memoryFiles());
  two = other.minter()();
  await commit(other, { holons: [typed(two, { says: "two" })], says: "two" });
  // Each opened again, as a host renews a store, so what was committed is what is read.
  return {
    types: await openStore(types.files),
    notes: await openStore(notes.files),
    other: await openStore(other.files),
  };
}

const attached = (given: Record<string, unknown>) =>
  Object.entries(given).map(([key, store]) => ({ key, store: store as never }));

test("a field read with its history answers from the same index", async () => {
  const { types, notes } = await stores();
  const all = await fieldOf(attached({ types, notes })).everything();

  expect(answeringOf({ ...all, logs: new Map() })).toBe(answeringOf(all));
});

test("a store a commit did not touch keeps its index; the one it touched is indexed again", async () => {
  const { types, notes, other } = await stores();
  const before = fieldOf(attached({ types, notes, other }));
  const first = storeIndexesOf(await before.everything());

  await commit(await openStore(notes.files), {
    holons: [typed(one, { says: "one, said again" })],
    says: "again",
  });
  const renewed = await openStore(notes.files);
  const after = storeIndexesOf(
    await fieldOf(attached({ types, notes: renewed, other }), before).everything(),
  );

  expect(after.get("other")).toBe(first.get("other"));
  expect(after.get("types")).toBe(first.get("types"));
  expect(after.get("notes")).not.toBe(first.get("notes"));
  expect(after.get("notes")!.answer({ a: "says", v: "one, said again" })).toHaveLength(1);
});

test("a store whose type changed is indexed again, though its own holons did not", async () => {
  const { types, notes, other } = await stores();
  const before = fieldOf(attached({ types, notes, other }));
  const first = storeIndexesOf(await before.everything());

  await commit(await openStore(types.files), {
    says: "the type again",
    holons: [
      {
        id: typeNote,
        instance: [],
        name: "note",
        mould: {
          says: { says: "What.", shape: "string" },
          about: { says: "Of what, held.", shape: "ref", holds: true },
        },
        body: {},
      },
    ],
  });
  const renewed = await openStore(types.files);
  const after = storeIndexesOf(
    await fieldOf(attached({ types: renewed, notes, other }), before).everything(),
  );

  expect(after.get("notes")).not.toBe(first.get("notes"));
  expect(after.get("other")).not.toBe(first.get("other"));
  expect(first.get("notes")!.answer({ a: "$holds" })).toHaveLength(0);
  expect(after.get("notes")!.answer({ a: "$holds" })).toHaveLength(1);
});

test("whatever is carried answers as an index built fresh, across a commit and a type's change", async () => {
  const { types, notes, other } = await stores();
  const before = fieldOf(attached({ types, notes, other }));
  storeIndexesOf(await before.everything());

  await commit(await openStore(notes.files), {
    holons: [typed(one, { says: "one, said again", about: { $ref: one } })],
    says: "again",
  });
  const after = await fieldOf(
    attached({ types, notes: await openStore(notes.files), other }),
    before,
  ).everything();

  for (const key of ["types", "notes", "other"]) answersAsFresh(after, key);
});

test("a holon another store comes to claim first leaves the later store's index", async () => {
  const { types, notes, other } = await stores();
  const alone = fieldOf(attached({ types, other }));
  const first = storeIndexesOf(await alone.everything());

  // The same holons, attached again behind a store that claims them first.
  const claimed = await fieldOf(attached({ types, notes, again: notes, other }), alone).everything();
  const again = storeIndexesOf(claimed);

  expect(again.get("other")).toBe(first.get("other"));
  expect(again.get("again")!.answer({ a: "says" })).toEqual([]);
  answersAsFresh(claimed, "notes");
});
