// A holon resides in every store that keeps it, none first (the author's, 2026-11-11:
// "holons can have multiple homes, there is nothing first about it"). It is one holon
// in the field, said once, and found in each of its stores: by store(), by what a store
// wrote since a moment, grouped by store, and as a fact of each store it is kept in.

import { expect, test } from "bun:test";
import { memoryFiles } from "../integrations/glass/files.ts";
import { commit, openStore, type Holon, type Store } from "../integrations/glass/store.ts";
import { namesIn } from "../language/names.ts";
import { template } from "../language/text.ts";
import { openStores } from "../stores.ts";
import { groups, type Everything, type Grouped } from "./expression.ts";
import { indexOf, mouldIn, type Asked } from "./facts.ts";
import { fieldOf, type Field } from "./field.ts";
import { answeringOf, howIndexed, kernel, storeIndexesOf, type Value } from "./kernel.ts";

const { glass } = await openStores();

const many = 40;

// A type, and two stores of notes that both keep one of them, the shared.
async function stores() {
  const types = await openStore(memoryFiles());
  const note = types.minter()();
  await commit(types, {
    says: "the type",
    holons: [{ id: note, instance: [], name: "note", mould: { says: { says: "What.", shape: "string" } }, body: {} }],
  });

  const a = await openStore(memoryFiles());
  const mint = a.minter();
  const ids = Array.from({ length: many }, () => mint());
  const notes = ids.map((id, i): Holon => ({ id, instance: [note], body: { says: `note ${i}` } }));
  await commit(a, { says: "notes", holons: notes });

  const b = await openStore(memoryFiles());
  const shared = notes[3]!;
  await commit(b, { says: "one also kept in a", holons: [shared] });
  const own = (await openStore(b.files)).minter();
  await commit(await openStore(b.files), {
    says: "notes of its own",
    holons: Array.from({ length: many }, (_, i) => ({ id: own(), instance: [note], body: { says: `b ${i}` } })),
  });

  return {
    note,
    shared: shared.id,
    types: await openStore(types.files),
    a: await openStore(a.files),
    b: await openStore(b.files),
  };
}

const attached = (given: Record<string, Store>) =>
  Object.entries({ glass, ...given }).map(([key, store]) => ({ key, store: store as never }));

const asking = (all: Everything) => {
  const { evaluate } = kernel({ all, logs: all.logs });
  const written = template(namesIn(all));
  return (parts: TemplateStringsArray, ...given: unknown[]) => evaluate(written(parts, ...given));
};

const ids = (value: Value) => (value as { $ref: string }[]).map(({ $ref }) => $ref);

// A store's index held against one made fresh: what it says of its own holons and the
// store fact of every holon it keeps.
function answersAsFresh(all: Everything, key: string) {
  const held = all.held.get(key)!;
  const own = held.filter((each) => all.known.get(each.holon.id) === each);
  const also = held.filter((each) => all.known.get(each.holon.id) !== each);
  const fresh = indexOf(held, mouldIn(all.known), new Set(also));
  const index = storeIndexesOf(all).get(key)!;

  const asked: Asked[] = [
    {},
    { a: "store" },
    { a: "says" },
    { a: "instance" },
    { a: "says", words: true },
    ...held.flatMap(({ holon: { id: e } }) => [{ e }, { e, a: "store" }]),
  ];
  for (const each of asked) expect(index.answer(each)).toEqual(fresh.answer(each));
}

test("a holon kept in two stores is one holon, in both", async () => {
  const { shared, types, a, b } = await stores();
  const all = await fieldOf(attached({ types, a, b })).everything();
  const ask = asking(all);

  expect(ids(ask`store("a")`)).toContain(shared);
  expect(ids(ask`store("b")`)).toContain(shared);
  expect(ids(ask`everything()`).filter((id) => id === shared)).toHaveLength(1);
});

test("its facts are said once, and its store once for each store it is kept in", async () => {
  const { shared, types, a, b } = await stores();
  const all = await fieldOf(attached({ types, a, b })).everything();
  const field = answeringOf(all);

  expect(field.answer({ e: shared, a: "says" })).toHaveLength(1);
  expect(field.answer({ e: shared, a: "store" }).map(({ v }) => v)).toEqual(["a", "b"]);
  expect(field.answer({ a: "store", v: "b" }).map(({ e }) => e)).toContain(shared);
  for (const key of ["a", "b"]) answersAsFresh(all, key);
});

test("grouped by store, it stands in each of its stores", async () => {
  const { note, shared, types, a, b } = await stores();
  const all = await fieldOf(attached({ types, a, b })).everything();
  const written = template(namesIn(all));
  const grouped = groups(all, written`group(type(${{ $ref: note }}), "store")` as never) as Grouped;

  expect(grouped.groups.map(({ value, count }) => [value, count])).toEqual([
    ["b", many + 1],
    ["a", many],
  ]);
  expect(grouped.rest).not.toContain(shared);
});

test("what a store wrote since a moment finds it there", async () => {
  const { shared, types, a, b } = await stores();
  const field = fieldOf(attached({ types, a, b }));
  const all = await field.everything();
  const logs = new Map(await Promise.all(["a", "b"].map(async (key) => [key, await (key === "a" ? a : b).log()] as const)));
  const ask = asking({ ...all, logs });

  expect(ids(ask`since("b", "2000-01-01")`)).toContain(shared);
});

test("a store keeping a holon another reads first is patched as one made fresh", async () => {
  const { shared, types, a, b } = await stores();
  const before: Field = fieldOf(attached({ types, a, b }));
  storeIndexesOf(await before.everything());

  const first = [...(await b.all()).keys()].find((id) => id !== shared)!;
  const { prev: _, ...holon } = (await b.read(first))!.version;
  await commit(await openStore(b.files), {
    says: "a note of b's said again",
    holons: [{ ...holon, body: { says: "b, said again" } }],
  });

  const after = await fieldOf(attached({ types, a, b: await openStore(b.files) }), before).everything();

  expect(howIndexed(after).get("b")).toBe("patched");
  expect(answeringOf(after).answer({ e: shared, a: "store" }).map(({ v }) => v)).toEqual(["a", "b"]);
  for (const key of ["a", "b"]) answersAsFresh(after, key);
});
