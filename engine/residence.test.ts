// A holon resides in every store that keeps it, none first (the author's, 2026-11-11:
// "holons can have multiple homes, there is nothing first about it"). It is one holon
// in the field, said once, and found in each of its stores: by store(), by what a store
// wrote since a moment, grouped by store, and as a fact of each store it is kept in.

import { describe, expect, test } from "bun:test";
import { memoryFiles } from "../integrations/glass/files.ts";
import { commit, openStore, type Holon, type Store } from "../integrations/glass/store.ts";
import { namesAsked } from "../language/names.ts";
import { parse } from "../language/text.ts";
import { openStores } from "../stores.ts";
import { startEngine, type Engine } from "./engine.ts";
import type { Everything, Expression, Grouped } from "./expression.ts";
import { indexOf, mouldIn, type Asked } from "./facts.ts";
import { fieldOf, type Field } from "./field.ts";
import { answeringOf, howIndexed, storeIndexesOf } from "./kernel.ts";

const { glass } = await openStores();

const many = 40;

// A type, and two stores of notes that both keep one of them, the shared.
async function stores() {
  const types = await openStore(memoryFiles());
  const note = types.minter()();
  await commit(types, {
    says: "the type",
    holons: [
      { id: note, instance: [], name: "note", mould: { says: { says: "What.", shape: "string" } }, body: {} },
    ],
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
    holons: Array.from({ length: many }, (_, i) => ({
      id: own(),
      instance: [note],
      body: { says: `b ${i}` },
    })),
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

// An engine over glass and the stores given, each only read.
const engineOver = (given: Record<string, Store>) =>
  startEngine(Object.entries({ glass, ...given }).map(([key, store]) => ({ key, store })));

// Asking, in the language, as engine/ask.ts does.
async function ask(engine: Engine, text: string) {
  return engine.read({ value: parse(text, await namesAsked(engine.read, text)) });
}

const ids = (value: unknown) => (value as { $ref: string }[]).map(({ $ref }) => $ref);

// What a holon's facts are, read once each: how many a pattern asking them reads.
async function factsRead(engine: Engine, text: string) {
  const plan = (await ask(engine, `explain(${text})`)) as { steps: { facts: number }[] };
  return plan.steps[0]!.facts;
}

// What an engine answers of the stores given, held against an engine started fresh.
async function storesAsFresh(engine: Engine, given: Record<string, Store>) {
  const fresh = engineOver(given);

  for (const key of Object.keys(given))
    for (const text of [
      `find({e: ?e, a: ?a, v: ?v}, [?e, "store", "${key}"], [?e, ?a, ?v])`,
      `find({e: ?e, v: ?v}, [?e, "store", "${key}"], [?e, "says", ?v])`,
      `find({e: ?e, w: ?w}, [?e, "store", "${key}"], said(?e, "says", ?w))`,
    ]) {
      const expression = parse(text, await namesAsked(engine.read, text));
      expect(await engine.read({ value: expression })).toEqual(await fresh.read({ value: expression }));
    }
}

// A store's index held against one made fresh: what it says of its own holons and the
// store fact of every holon it keeps.
function indexAsFresh(all: Everything, key: string) {
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
  const engine = engineOver({ types, a, b });

  expect(ids(await ask(engine, `store("a")`))).toContain(shared);
  expect(ids(await ask(engine, `store("b")`))).toContain(shared);
  expect(ids(await ask(engine, `everything()`)).filter((id) => id === shared)).toHaveLength(1);
});

test("its facts are said once, and its store once for each store it is kept in", async () => {
  const { shared, types, a, b } = await stores();
  const engine = engineOver({ types, a, b });

  expect(await factsRead(engine, `find(?s, [@${shared}, "says", ?s])`)).toBe(1);
  expect(await ask(engine, `find(?s, [@${shared}, "store", ?s])`)).toEqual(["a", "b"]);
  expect(ids(await ask(engine, `find(?e, [?e, "store", "b"])`))).toContain(shared);
});

test("grouped by store, it stands in each of its stores", async () => {
  const { note, shared, types, a, b } = await stores();
  const engine = engineOver({ types, a, b });
  const text = `group(type(@${note}), "store")`;
  const grouped = (await engine.read({
    groups: parse(text, await namesAsked(engine.read, text)) as Expression,
  })) as Grouped;

  expect(grouped.groups.map(({ value, count }) => [value, count])).toEqual([
    ["b", many + 1],
    ["a", many],
  ]);
  expect(grouped.rest).not.toContain(shared);
});

test("what a store wrote since a moment finds it there", async () => {
  const { shared, types, a, b } = await stores();
  const engine = engineOver({ types, a, b });

  expect(ids(await ask(engine, `since("b", "2000-01-01")`))).toContain(shared);
});

test("a store keeping a holon another reads first is patched as one made fresh", async () => {
  const { shared, types, a, b } = await stores();
  const engine = engineOver({ types, a, b });
  await storesAsFresh(engine, { types, a, b });

  const first = [...(await b.all()).keys()].find((id) => id !== shared)!;
  const { prev: _, ...holon } = (await b.read(first))!.version;
  await commit(await openStore(b.files), {
    says: "a note of b's said again",
    holons: [{ ...holon, body: { says: "b, said again" } }],
  });
  const renewed = await openStore(b.files);
  await engine.renew("b", renewed);

  expect(await ask(engine, `find(?s, [@${shared}, "store", ?s])`)).toEqual(["a", "b"]);
  await storesAsFresh(engine, { types, a, b: renewed });
});

describe("unit: the index's carrying (rewritten with the index)", () => {
  test("its facts are said once, and its store once for each store it is kept in", async () => {
    const { shared, types, a, b } = await stores();
    const all = await fieldOf(attached({ types, a, b })).everything();
    const field = answeringOf(all);

    expect(field.answer({ e: shared, a: "says" })).toHaveLength(1);
    expect(field.answer({ e: shared, a: "store" }).map(({ v }) => v)).toEqual(["a", "b"]);
    expect(field.answer({ a: "store", v: "b" }).map(({ e }) => e)).toContain(shared);
    for (const key of ["a", "b"]) indexAsFresh(all, key);
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
    expect(
      answeringOf(after)
        .answer({ e: shared, a: "store" })
        .map(({ v }) => v),
    ).toEqual(["a", "b"]);
    for (const key of ["a", "b"]) indexAsFresh(after, key);
  });
});
