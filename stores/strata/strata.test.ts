import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentOf, hashOf, partOf } from "../act.ts";
import type { Act, Head, Holon, Question, Store } from "../store.ts";
import { headAt, stateNow } from "./head.ts";
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

// An act as an engine makes it, for the store named here, and others it names.
async function act(
  over: Head | null,
  holons: Holon[],
  gone: string[] = [],
  touches?: Act["touches"],
  others: Act["parts"] = [],
): Promise<Act> {
  const part = partOf(holons);
  const said = {
    when: new Date(acts++).toISOString(),
    at: [] as Act["at"],
    says: "a test",
    gone,
    parts: [["here", part && (await hashOf(part))], ...others] as Act["parts"],
  };

  return {
    ...said,
    hash: await hashOf(contentOf(said)),
    own: "here",
    holons,
    born: [],
    over,
    touches: touches ?? { ids: [...holons.map((holon) => holon.id), ...gone], addresses: [] },
  };
}

async function accepted(store: Store, offered: Act | Promise<Act>) {
  const reply = await store.offer(await offered);
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

    expect(await read(store, head, { holon: id(1) })).toEqual([note]);
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

  test("a whole is read in one question, to a depth, not entering what stop names, nor what it does not keep", async () => {
    const { store } = opened();
    const word = { id: id(5), instance: [id(102)], body: { text: "holds" } };
    const sentence = { id: id(4), instance: [id(102)], body: { words: [ref(5, true)] } };
    const paragraph = { id: id(3), instance: [id(101)], body: { parts: [ref(4, true), ref(9, true)] } };
    const top = { ...whole, body: { parts: [ref(3, true), ref(1)] } };
    const head = await accepted(store, act(null, [top, paragraph, sentence, word, note]));
    const ids = async (whole: { id: string; depth?: number; stop?: string[] }) =>
      (await read(store, head, { whole })).map(({ id }) => id);

    expect(await ids({ id: id(2) })).toEqual([id(2), id(3), id(4), id(5)]);
    expect(await ids({ id: id(2), depth: 1 })).toEqual([id(2), id(3)]);
    expect(await ids({ id: id(2), stop: [id(102)] })).toEqual([id(2), id(3), id(4)]);
    expect(await ids({ id: id(9) })).toEqual([]);
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

  test("a text longer than a key holds is found by its words, its value and its attribute, and read whole", async () => {
    const { store } = opened();
    const long = { ...note, body: { text: "word ".repeat(14000) + "end" } };
    const other = { ...note, id: id(3), name: "Other", body: { text: "zebra" } };
    const head = await accepted(store, act(null, [long, other]));

    expect(await read(store, head, { facts: { a: "instance", v: { $ref: id(100) } } })).toHaveLength(2);
    expect(await read(store, head, { said: { a: "text", word: "zebra" } })).toHaveLength(1);
    expect(await read(store, head, { said: { a: "text", word: "end" } })).toEqual([
      { e: id(1), a: "text", v: "end" },
    ]);
    expect(await read(store, head, { facts: { a: "text", v: long.body.text } })).toEqual([
      { e: id(1), a: "text", v: long.body.text },
    ]);
    expect(await read(store, head, { facts: { a: "text", v: long.body.text + "!" } })).toEqual([]);
    expect((await read(store, head, { facts: { a: "text" } })).map((fact) => fact.v).sort()).toEqual([
      long.body.text,
      "zebra",
    ]);
  });

  test("a holon's facts are found by its value too", async () => {
    const { store } = opened();
    const head = await accepted(store, act(null, [note]));
    expect(await read(store, head, { facts: { e: id(1), v: "Glass holds holons" } })).toEqual([
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

  test("letting go of what the store does not keep changes nothing here", async () => {
    const { store } = opened();
    const first = await accepted(store, act(null, [note]));
    const second = await accepted(store, act(first, [], [id(7)]));

    expect(await read(store, second, { holon: id(1) })).toEqual([note]);
    expect(await read(store, second, { acts: {} })).toHaveLength(2);
  });

  test("an act whose hash or part does not hold is refused", async () => {
    const { store } = opened();
    const forged = { ...(await act(null, [note])), hash: "0".repeat(64) };
    expect(await store.offer(forged)).toEqual({
      refused: [{ rule: "hash", says: "the act's hash is not the hash of what it says" }],
    });

    const other = await act(null, [note]);
    expect(await store.offer({ ...other, holons: [whole] })).toEqual({
      refused: [
        { rule: "part", says: "the act does not name this store's part as the holons offered make it" },
      ],
    });
  });

  test("an act across stores is kept whole, and is found by its content hash", async () => {
    const { store } = opened();
    const offered = await act(null, [note], [], undefined, [["elsewhere", "f".repeat(64)]]);
    const head = await accepted(store, offered);

    expect(head.act).toBe(offered.hash);
    const [kept] = await read(store, head, { acts: {} });
    expect(kept.parts).toEqual(offered.parts);
    expect(await read(store, head, { act: offered.hash })).toEqual([{ act: offered.hash, number: 1 }]);
    expect(await read(store, head, { act: "e".repeat(64) })).toEqual([]);
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
    expect(one.commit).not.toBe(other.commit);
  });

  test("an act judged over an older head is handed back when another touched the same holon", async () => {
    const { store } = opened();
    const first = await accepted(store, act(null, [note]));
    const moved = await accepted(store, act(first, [{ ...note, body: { text: "one" } }]));

    expect(await store.offer(await act(first, [{ ...note, body: { text: "two" } }]))).toEqual({
      changed: moved,
    });
  });

  test("an act judged over an older head is handed back when another took an address it touches", async () => {
    const { store } = opened();
    const first = await accepted(store, act(null, [note, whole]));
    const other = { id: id(3), instance: [id(100)], name: "New", body: {} };
    const moved = await accepted(
      store,
      act(first, [{ ...whole, body: { parts: [ref(1, true), ref(3, true)] } }, other]),
    );

    const late = await act(first, [{ ...note, id: id(4), name: "Late" }], [], {
      ids: [id(4)],
      addresses: [[id(2), "New"]],
    });
    expect(await store.offer(late)).toEqual({ changed: moved });
  });
});

test("one act offered twice at once, by two instances over one storage, is taken once", async () => {
  const { storage, store } = opened();
  const twin = strata(storage);
  const offered = await act(null, [note]);
  const replies = await Promise.all([store.offer(offered), twin.offer(offered)]);

  const now = (await stateNow(storage))!;
  expect(replies).toEqual([
    { accepted: await headAt(storage, now.commit) },
    { accepted: await headAt(storage, now.commit) },
  ]);
  expect(now.runs).toHaveLength(1);
  expect(await read(store, await headAt(storage, now.commit), { holon: id(1) })).toEqual([note]);
});

test("a rename racing a hold, from two instances over one storage, leaves the index as the commits make it", async () => {
  for (let trial = 0; trial < 10; trial++) {
    const { storage, store } = opened();
    const other = strata(storage);
    const first = await accepted(store, act(null, [note, { ...whole, body: { parts: [] } }]));

    const hold = await act(first, [whole], [], { ids: [id(2)], addresses: [[id(2), "Notes"]] });
    const rename = await act(first, [{ ...note, name: "Renamed" }], [], { ids: [id(1)], addresses: [] });
    const replies = await Promise.all([store.offer(hold), other.offer(rename)]);
    expect(replies.every((reply) => "accepted" in reply)).toBe(true);

    const latest = await headAt(storage, (await stateNow(storage))!.commit);
    expect(await read(store, latest, { address: [id(2), "Notes"] })).toEqual([]);
    expect((await read(store, latest, { address: [id(2), "Renamed"] }))[0].id).toBe(id(1));
  }
});

test("an act offered again after other acts is answered as taken, at the commit that took it", async () => {
  const { store } = opened();
  const offered = await act(null, [note]);
  const taken = await accepted(store, offered);
  await accepted(store, act(taken, [whole]));

  expect(await store.offer(offered)).toEqual({ accepted: taken });
  expect(await read(store, taken, { acts: {} })).toHaveLength(1);
});

test("runs of many pages answer every key and every range, before and after they merge", async () => {
  const { store } = opened();
  const many = (from: number, count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: id(from + i),
      instance: [id(100)],
      name: `n${from + i}`,
      body: { text: `word${from + i} shared` },
    }));

  const first = await accepted(store, act(null, many(1000, 3000)));
  const second = await accepted(store, act(first, many(5000, 3000)));
  await new Promise((resolve) => setTimeout(resolve, 300));

  for (const n of [1000, 1001, 2500, 3999, 5000, 6500, 7999])
    expect((await read(store, second, { holon: id(n) }))[0].name).toBe(`n${n}`);
  expect(await read(store, first, { holon: id(5000) })).toEqual([]);
  expect(await read(store, second, { facts: { a: "instance", v: { $ref: id(100) } } })).toHaveLength(6000);
  expect(await read(store, first, { said: { a: "text", word: "shared" } })).toHaveLength(3000);
  expect(await read(store, second, { said: { a: "text", word: "word6500" } })).toEqual([
    { e: id(6500), a: "text", v: "word6500" },
  ]);
});

describe("compaction", () => {
  test("runs are merged as acts come, and every head still reads as it did", async () => {
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

    const now = (await stateNow(storage))!;
    // Runs grow by doubling: twenty acts of one holon each leave a few runs, not twenty.
    expect(now.runs.length).toBeLessThanOrEqual(5);

    const latest = await headAt(storage, now.commit);
    expect(latest).toEqual(head!);
    for (let n = 0; n < waiting + 4; n++)
      expect(await read(store, latest, { said: { a: "text", word: `word${n}` } })).toHaveLength(1);
    expect(await read(store, heads[3]!, { holon: id(10) })).toEqual([]);
    expect(await read(store, heads[3]!, { holon: id(3) })).toHaveLength(1);
  });
});

test("a holon rewritten again and again reads at every head as that head wrote it, after runs merge", async () => {
  const { store } = opened();
  const heads: Head[] = [];
  let head: Head | null = null;

  for (let n = 0; n < 12; n++) {
    head = await accepted(store, act(head, [{ ...note, body: { text: `draft${n}` } }]));
    heads.push(head);
  }
  await new Promise((resolve) => setTimeout(resolve, 200));

  for (const [n, at] of heads.entries()) {
    expect((await read(store, at, { holon: id(1) }))[0].body.text).toBe(`draft${n}`);
    expect(await read(store, at, { said: { a: "text", word: `draft${n}` } })).toHaveLength(1);
    expect(await read(store, at, { said: { a: "text", word: `draft${(n + 1) % 12}` } })).toEqual([]);
  }
});

test("a subscriber is told the head, and every move of it", async () => {
  const { store } = opened();
  const told: (Head | null)[] = [];
  const stop = await store.subscribe((head) => told.push(head));

  const head = await accepted(store, act(null, [note]));
  await new Promise((resolve) => setTimeout(resolve, 150));
  stop();

  // Compaction moves the head too, to the same commit, and no subscriber is told.
  expect(told).toEqual([null, head]);
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
  expect((await stateNow(storage))!.runs.length).toBeLessThan(5);
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
  // Holons no other test writes, so no part of theirs is read from what is kept in memory.
  const first = await accepted(
    store,
    act(null, [
      { ...note, body: { text: "held" } },
      { ...whole, name: "Held" },
    ]),
  );
  await new Promise((resolve) => setTimeout(resolve, 100));

  // The run's index is read once, by reading the note; the whole's version has not been
  // read yet, so reading it reaches the storage.
  await store.read(first, { holon: id(1) });
  holding = true;
  const reading = store.read(first, { holon: id(2) });
  await new Promise((resolve) => setTimeout(resolve, 20));
  // As many entries as the first act, so that the two runs are to be merged.
  const more = [7, 8, 9].map((n) => ({ ...note, id: id(n), name: `n${n}` }));
  await accepted(store, act(first, [{ ...note, body: { text: "again" } }, ...more]));
  await new Promise((resolve) => setTimeout(resolve, 100));
  const whileReading = (await stateNow(storage))!.runs.length;

  release();
  await reading;
  await new Promise((resolve) => setTimeout(resolve, 200));
  const afterwards = (await stateNow(storage))!.runs.length;

  expect([whileReading, afterwards]).toEqual([2, 1]);
});
