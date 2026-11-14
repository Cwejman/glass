import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Act, Head, Holon, Question, Store } from "../store.ts";
import { compactor } from "./compactor.ts";
import { rootAt } from "./root.ts";
import { folderStorage } from "./storage/folder.ts";
import { strata } from "./strata.ts";

const made: string[] = [];
afterAll(() => made.forEach((at) => rmSync(at, { recursive: true, force: true })));

function opened() {
  const folder = mkdtempSync(join(tmpdir(), "glass-strata-"));
  made.push(folder);
  const storage = folderStorage(folder);
  return { storage, store: strata(storage) };
}

const id = (n: number) => String(n).padStart(15, "0");
const ref = (n: number, holds = false) => (holds ? { $ref: id(n), $holds: true } : { $ref: id(n) });
let acts = 0;

function act(over: Head | null, holons: Holon[], gone: string[] = [], touches?: Act["touches"]): Act {
  return {
    hash: `act ${acts++}`,
    at: new Date(0).toISOString(),
    says: "a test",
    over,
    holons,
    gone,
    touches: touches ?? { ids: [...holons.map((holon) => holon.id), ...gone], addresses: [] },
    alongside: [],
  };
}

async function accepted(store: Store, offered: Act) {
  const reply = await store.offer(offered);
  if (!("accepted" in reply)) throw new Error(`not accepted: ${JSON.stringify(reply)}`);
  return reply.accepted;
}

async function read(store: Store, head: Head, question: Question) {
  const text = new TextDecoder().decode(await store.read(head, question));
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

const note = { id: id(1), instance: [id(100)], name: "Notes", body: { text: "Glass holds holons" } };
const whole = { id: id(2), instance: [id(101)], name: "Home", body: { parts: [ref(1, true)] } };

describe("strata", () => {
  test("a holon written is read back as it was written", async () => {
    const { store } = opened();
    const head = await accepted(store, act(null, [note, whole]));

    expect(await read(store, head, { holon: id(1) })).toEqual([{ ...note, prev: null }]);
    expect(await read(store, head, { holon: id(9) })).toEqual([]);
  });

  test("a holon is found by its address, and moves when renamed", async () => {
    const { store } = opened();
    const first = await accepted(store, act(null, [note, whole]));
    expect((await read(store, first, { address: [id(2), "Notes"] }))[0].id).toBe(id(1));

    const renamed = await accepted(store, act(first, [{ ...note, name: "Jottings" }]));
    expect(await read(store, renamed, { address: [id(2), "Notes"] })).toEqual([]);
    expect((await read(store, renamed, { address: [id(2), "Jottings"] }))[0].id).toBe(id(1));
    expect((await read(store, first, { address: [id(2), "Notes"] }))[0].id).toBe(id(1));
  });

  test("facts are found by attribute and value, by reference, and by holon", async () => {
    const { store } = opened();
    const head = await accepted(store, act(null, [note, whole]));

    expect(await read(store, head, { facts: { a: "instance", v: { $ref: id(100) } } })).toEqual([
      { e: id(1), a: "instance", v: { $ref: id(100) } },
    ]);
    expect(await read(store, head, { facts: { v: { $ref: id(1) } } })).toEqual([
      { e: id(2), a: "$holds", v: { $ref: id(1) } },
      { e: id(2), a: "parts", v: { $ref: id(1) } },
    ]);
    expect(await read(store, head, { facts: { a: "name" } })).toHaveLength(2);
    expect(await read(store, head, { facts: { e: id(1), a: "text" } })).toEqual([
      { e: id(1), a: "text", v: "Glass holds holons" },
    ]);
  });

  test("a word is found whatever its case or accents", async () => {
    const { store } = opened();
    const head = await accepted(store, act(null, [{ ...note, body: { text: "Une Âme de verre" } }]));

    expect(await read(store, head, { said: { a: "text", word: "ame" } })).toEqual([
      { e: id(1), a: "text", v: "ame" },
    ]);
  });

  test("a holon's versions are read newest first, and its old facts are gone", async () => {
    const { store } = opened();
    const first = await accepted(store, act(null, [note]));
    const second = await accepted(store, act(first, [{ ...note, body: { text: "changed" } }]));

    const versions = await read(store, second, { versions: id(1) });
    expect(versions.map((version) => version.body.text)).toEqual(["changed", "Glass holds holons"]);
    expect(await read(store, second, { said: { a: "text", word: "holons" } })).toEqual([]);
    expect(await read(store, first, { said: { a: "text", word: "holons" } })).toHaveLength(1);
  });

  test("a holon let go is gone, with its facts and its address", async () => {
    const { store } = opened();
    const first = await accepted(store, act(null, [note, whole]));
    const second = await accepted(store, act(first, [{ ...whole, body: { parts: [] } }], [id(1)]));

    expect(await read(store, second, { holon: id(1) })).toEqual([]);
    expect(await read(store, second, { facts: { a: "instance", v: { $ref: id(100) } } })).toEqual([]);
    expect(await read(store, second, { address: [id(2), "Notes"] })).toEqual([]);
  });

  test("the acts since one are read newest first", async () => {
    const { store } = opened();
    const first = await accepted(store, act(null, [note]));
    const second = await accepted(store, act(first, [whole]));

    const since = await read(store, second, { acts: { since: first.act } });
    expect(since.map((each) => each.hash)).toEqual([second.act]);
    expect(await read(store, second, { acts: {} })).toHaveLength(2);
  });

  test("letting go of what the store does not keep is refused", async () => {
    const { store } = opened();
    const reply = await store.offer(act(null, [], [id(7)]));
    expect(reply).toEqual({ refused: [{ rule: "gone", id: id(7), says: "this store does not keep it" }] });
  });
});

describe("acts that race", () => {
  test("an act judged over an older head is laid over the newer one when they touch nothing in common", async () => {
    const { store } = opened();
    const first = await accepted(store, act(null, [note]));

    const one = await accepted(store, act(first, [whole]));
    const other = await accepted(store, act(first, [{ ...note, id: id(3), name: "Other" }]));

    expect(await read(store, other, { holon: id(2) })).toHaveLength(1);
    expect(await read(store, other, { holon: id(3) })).toHaveLength(1);
    expect(one.page).not.toBe(other.page);
  });

  test("an act judged over an older head is handed back when another touched the same holon", async () => {
    const { store } = opened();
    const first = await accepted(store, act(null, [note]));
    const moved = await accepted(store, act(first, [{ ...note, body: { text: "one" } }]));

    expect(await store.offer(act(first, [{ ...note, body: { text: "two" } }]))).toEqual({ changed: moved });
  });
});

describe("compaction", () => {
  test("layers are merged into the trees as acts come, and every head still reads as it did", async () => {
    const waiting = 16;
    const { storage, store } = opened();
    const compacting = compactor(storage);
    let head: Head | null = null;
    const heads: Head[] = [];

    for (let n = 0; n < waiting + 4; n++) {
      head = await accepted(
        store,
        act(head, [{ ...note, id: id(n), name: `n${n}`, body: { text: `word${n}` } }]),
      );
      heads.push(head);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));

    const now = (await storage.head())!;
    const root = await rootAt(storage, now);
    expect(root.pending.length).toBe(0);
    expect(Object.values(root.trees).some(Boolean)).toBe(true);

    const latest = { act: root.act, page: now };
    for (let n = 0; n < waiting + 4; n++)
      expect(await read(store, latest, { said: { a: "text", word: `word${n}` } })).toHaveLength(1);
    expect(await read(store, heads[3]!, { holon: id(10) })).toEqual([]);
    expect(await read(store, heads[3]!, { holon: id(3) })).toHaveLength(1);
    await compacting.stop();
  });
});

test("a subscriber is told the head, and every move of it", async () => {
  const { store } = opened();
  const told: (Head | null)[] = [];
  const stop = await store.subscribe((head) => told.push(head));

  const head = await accepted(store, act(null, [note]));
  await new Promise((resolve) => setTimeout(resolve, 150));
  stop();

  expect(told).toEqual([null, head]);
});

test("on a machine, strata runs with its compactor on a worker beside it", async () => {
  const folder = mkdtempSync(join(tmpdir(), "glass-strata-"));
  made.push(folder);
  const { workers } = await import("../../runtime/runtime.ts");
  const store = await workers().run<Store>(new URL("./machine.ts", import.meta.url), { folder });

  let head: Head | null = null;
  for (let n = 0; n < 5; n++) head = await accepted(store, act(head, [{ ...note, id: id(n), name: `n${n}` }]));
  await new Promise((resolve) => setTimeout(resolve, 300));

  const storage = folderStorage(folder);
  expect((await rootAt(storage, (await storage.head())!)).pending).toHaveLength(0);
  expect(await read(store, head!, { holon: id(4) })).toHaveLength(1);
});
