import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Act, Head, Holon, Question, Store } from "../store.ts";
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

  test("a whole rewritten keeps its parts' addresses, moves a renamed one, and gives one to a part added", async () => {
    const { store } = opened();
    const first = await accepted(store, act(null, [note, whole]));
    const other = { id: id(3), instance: [id(100)], name: "Other", body: {} };
    const next = await accepted(
      store,
      act(first, [
        { ...whole, body: { parts: [ref(1, true), ref(3, true)] } },
        { ...note, name: "Renamed" },
        other,
      ]),
    );

    expect(await read(store, next, { address: [id(2), "Notes"] })).toEqual([]);
    expect((await read(store, next, { address: [id(2), "Renamed"] }))[0].id).toBe(id(1));
    expect((await read(store, next, { address: [id(2), "Other"] }))[0].id).toBe(id(3));
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
  });
});

test("a subscriber is told the head, and every move of it", async () => {
  const { store } = opened();
  const told: (Head | null)[] = [];
  const stop = await store.subscribe((head) => told.push(head));

  const head = await accepted(store, act(null, [note]));
  await new Promise((resolve) => setTimeout(resolve, 150));
  stop();

  // Compaction moves the head too, to a root of the same act, and a folder may report
  // only the last of two moves close together.
  expect(told[0]).toBeNull();
  expect(told.length).toBeGreaterThan(1);
  expect(told.slice(1).every((each) => each?.act === head.act)).toBe(true);
});

test("on a worker, strata compacts what its acts lay", async () => {
  const folder = mkdtempSync(join(tmpdir(), "glass-strata-"));
  made.push(folder);
  const { workers } = await import("../../runtime/runtime.ts");
  const store = await workers().run<Store>(new URL("./machine.ts", import.meta.url), { folder });

  let head: Head | null = null;
  for (let n = 0; n < 5; n++)
    head = await accepted(store, act(head, [{ ...note, id: id(n), name: `n${n}` }]));
  await new Promise((resolve) => setTimeout(resolve, 300));

  const storage = folderStorage(folder);
  expect((await rootAt(storage, (await storage.head())!)).pending).toHaveLength(0);
  expect(await read(store, head!, { holon: id(4) })).toHaveLength(1);
});

test("compaction waits while a read is under way", async () => {
  const { storage } = opened();
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let holding = false;

  // A storage that holds the first read asked of it once holding, so that read stays
  // under way until released.
  const slow = {
    ...storage,
    read: async (...args: Parameters<typeof storage.read>) => {
      if (holding) {
        holding = false;
        await held;
      }
      return storage.read(...args);
    },
  };
  const store = strata(slow);
  const first = await accepted(store, act(null, [note, whole]));
  await new Promise((resolve) => setTimeout(resolve, 100));

  // The whole's version has not been read yet, so reading it reaches the storage.
  holding = true;
  const reading = store.read(first, { holon: id(2) });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await accepted(store, act(first, [{ ...note, body: { text: "again" } }]));
  await new Promise((resolve) => setTimeout(resolve, 100));
  const whileReading = (await rootAt(storage, (await storage.head())!)).pending.length;

  release();
  await reading;
  await new Promise((resolve) => setTimeout(resolve, 200));
  const afterwards = (await rootAt(storage, (await storage.head())!)).pending.length;

  expect([whileReading, afterwards]).toEqual([1, 0]);
});
