// The format's vectors, and what must be refused. Each test writes into files of
// its own and reads them back through a store opened afresh.

import { expect, test } from "bun:test";
import { canonical } from "./canonical.ts";
import { memoryFiles, servedFiles } from "./files.ts";
import {
  act,
  commit,
  goneIds,
  goneOf,
  isId,
  land,
  nextId,
  openStore,
  sha,
  writtenBy,
  type Holon,
  type Store,
} from "./store.ts";

const vectors = await Bun.file(new URL("./vectors/format.json", import.meta.url)).json();
const canonicalCases = await Bun.file(new URL("./vectors/canonical.json", import.meta.url)).json();

const text = (bytes: Uint8Array | null | undefined) => new TextDecoder().decode(bytes ?? new Uint8Array());

const fresh = () => openStore(memoryFiles());

const memoryOf = (store: Store) => (store.files as ReturnType<typeof memoryFiles>).held;

const logOf = (store: Store) => text(memoryOf(store).get("log/0.jsonl")).trim().split("\n");

const textsOf = async (store: Store) =>
  Object.fromEntries([...(await store.all())].map(([id, { version }]) => [id, version.body.text]));

async function build(upTo = vectors.steps.length) {
  let store = await fresh();

  for (const { holons, says, at, gone } of vectors.steps.slice(0, upTo)) {
    store = (await commit(store, { holons, says, at, gone })).store;
  }

  return store;
}

const reopened = (store: Store) => openStore(memoryFiles(new Map(memoryOf(store))));

test("canonical text is what the vectors say, and hashes to what they say", async () => {
  for (const { json, canonical: wanted, name } of canonicalCases) {
    const made = canonical(JSON.parse(json));

    expect(made).toBe(wanted);
    expect(`sha256-${await sha(made)}`).toBe(name);
  }
});

test("each step writes these bytes and reads back as this field", async () => {
  let store = await fresh();

  for (const step of vectors.steps) {
    store = (await commit(store, step)).store;

    for (const [hash, content] of Object.entries(step.blocks)) {
      expect(text(memoryOf(store).get(`blocks/${hash}.jsonl`))).toBe(content as string);
    }

    expect(logOf(store)).toEqual(step.log);
    expect(text(memoryOf(store).get("refs/main"))).toBe(step.ref);
    expect(await textsOf(await reopened(store))).toEqual(step.field);
  }
});

test("an id counts up, carrying across its last characters", () => {
  for (const [name, next] of vectors.ids.next) expect(nextId(name)).toBe(next);

  expect(isId("1M6XGF6G0000100")).toBe(true);
  expect(isId("1m6xgf6g0000100")).toBe(false);
  expect(isId("too short")).toBe(false);
});

test("a store says what it may hold without fetching anything", async () => {
  const store = await build();
  const [held] = vectors.steps[0].holons as Holon[];
  const count = { reads: 0 };
  const files = memoryFiles(new Map(memoryOf(store)));
  const counting = { ...files, read: (path: string) => (count.reads++, files.read(path)) };
  const opened = await openStore(counting);
  const afterOpening = count.reads;

  expect(opened.mayHold(held!.id)).toBe(true);
  expect(opened.mayHold("0".repeat(15))).toBe(false);
  expect(count.reads).toBe(afterOpening);
  expect(afterOpening).toBe(2);
});

test("the field at any commit, and any holon's versions, stay readable", async () => {
  const store = await build();

  for (const [index, wanted] of Object.entries(vectors.history)) {
    const held = await store.allAt(Number(index));

    expect(Object.fromEntries([...held].map(([id, { version }]) => [id, version.body.text]))).toEqual(
      wanted as any,
    );
  }

  const { id, texts } = vectors.versions;

  expect((await store.versions(id)).map((version) => version.body.text)).toEqual(texts);
  expect((await store.log()).map(({ says }) => says)).toEqual(["first", "second"]);
});

test("a holon taken out reads as nothing, its versions kept", async () => {
  const store = await build();
  const gone = vectors.steps[1].gone[0];

  expect(await store.read(gone)).toBe(null);
  expect((await store.versions(gone)).map((version) => version.body.text)).toEqual(["two"]);
});

test("a holon taken out can be written again", async () => {
  const store = await build();
  const gone = vectors.steps[1].gone[0];
  const instance = vectors.steps[0].holons[1].instance;

  const { store: next } = await commit(store, {
    holons: [{ id: gone, instance, body: { text: "back" } }],
    says: "back",
  });

  expect((await next.read(gone))?.version.body.text).toBe("back");
  expect((await next.versions(gone)).length).toBe(2);
});

test("a copy written apart lands without changing its blocks", async () => {
  const { from, holons, says, at, block, log, ref, field } = vectors.land;

  const apart = (await commit(await build(from), { holons, says, at })).store;
  const here = await build();

  const { landed, store } = await land(here, apart);

  expect(landed).toBe(1);
  expect(logOf(store)).toEqual(log);
  expect(text(memoryOf(store).get("refs/main"))).toBe(ref);

  for (const [hash, content] of Object.entries(block)) {
    expect(text(memoryOf(store).get(`blocks/${hash}.jsonl`))).toBe(content as string);
  }

  expect(await textsOf(await reopened(store))).toEqual(field);
});

test("two copies that changed one holon stop and ask", async () => {
  const { id } = vectors.versions;
  const type = vectors.steps[0].holons[0].id;

  const apart = (
    await commit(await build(1), {
      holons: [{ id, instance: [type], body: { text: "the other edit" } }],
      says: "apart",
    })
  ).store;

  await expect(land(await build(), apart)).rejects.toThrow("both copies changed");
});

test("two copies that share nothing do not land", async () => {
  const other = (
    await commit(await fresh(), {
      holons: [{ id: "1M6XGF9K0000000", instance: [], body: {} }],
      says: "another",
    })
  ).store;

  await expect(land(await build(), other)).rejects.toThrow("no history");
});

test("a commit refuses a stale store and new names that are not one run", async () => {
  const stale = await build();
  const mint = stale.minter();
  const ahead = openStore(stale.files);

  await commit(await ahead, { holons: [{ id: mint(), instance: [], body: {} }], says: "ahead" });
  await expect(commit(stale, { holons: [], says: "stale" })).rejects.toThrow("the store moved");

  const current = await openStore(stale.files);
  const mint2 = current.minter();
  const first = mint2();
  mint2();
  const third = mint2();

  await expect(
    commit(current, {
      holons: [
        { id: first, instance: [], body: {} },
        { id: third, instance: [], body: {} },
      ],
      says: "a gap",
    }),
  ).rejects.toThrow("not one run");
});

test("two commits within one tick of the clock are still apart", async () => {
  let store = await fresh();

  for (let i = 0; i < 20; i++) {
    store = (
      await commit(store, {
        holons: [{ id: store.minter()(), instance: [], body: { text: `${i}` } }],
        says: `${i}`,
      })
    ).store;
  }

  expect((await store.all()).size).toBe(20);
});

test("a commit that never moved the ref was never part of the store", async () => {
  const store = await build();
  const held = new Map(memoryOf(store));
  const log = text(held.get("log/0.jsonl"));
  const lost = `{"at":"t","blocks":[],"gone":[],"parent":"${store.head}","says":"never finished"}\n`;

  held.set("log/0.jsonl", new TextEncoder().encode(log + lost));

  const reopened = await openStore(memoryFiles(held));

  expect(reopened.head).toBe(store.head);
  expect(await textsOf(reopened)).toEqual(await textsOf(store));
  expect((await reopened.log()).length).toBe(2);

  const { store: next } = await commit(reopened, {
    holons: [{ id: reopened.minter()(), instance: [], body: { text: "after" } }],
    says: "after",
  });

  expect((await next.log()).map(({ says }) => says)).toEqual(["first", "second", "after"]);
  expect(await openStore(next.files)).toBeTruthy();
});

test("a block a host answered wrongly is not kept", async () => {
  const store = await build();
  const hash = Object.keys(vectors.steps[0].blocks)[0]!;
  const kept = memoryFiles();
  const realFetch = globalThis.fetch;
  let answer = "not the block";

  globalThis.fetch = (async (url: string) =>
    new Response(
      String(url).includes("blocks/")
        ? answer
        : text(memoryOf(store).get(String(url).replace("https://h/", ""))),
    )) as typeof fetch;

  try {
    const served = servedFiles("https://h/", kept);

    await expect((await openStore(served)).read(vectors.steps[0].holons[0].id)).rejects.toThrow(
      "does not match",
    );
    expect(kept.held.size).toBe(0);

    answer = vectors.steps[0].blocks[hash];

    expect(await (await openStore(served)).read(vectors.steps[0].holons[0].id)).toBeTruthy();
    expect(kept.held.has(`blocks/${hash}.jsonl`)).toBe(true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("landing again brings only what is new, in either direction", async () => {
  const type = vectors.steps[0].holons[0].id;
  const note = (store: Store, body: string) =>
    commit(store, { holons: [{ id: store.minter()(), instance: [type], body: { text: body } }], says: body });

  const base = await build();
  const apartFiles = memoryFiles(new Map(memoryOf(base)));
  let apart = await openStore(apartFiles);
  let here = base;

  apart = (await note(apart, "apart one")).store;
  await Bun.sleep(2);

  here = (await land(here, apart)).store;
  expect((await land(here, apart)).landed).toBe(0);

  apart = (await note(apart, "apart two")).store;
  await Bun.sleep(2);

  const again = await land(here, apart);

  expect(again.landed).toBe(1);
  expect(Object.values(await textsOf(again.store))).toContain("apart two");
  expect((await land(apart, again.store)).landed).toBe(0);
});

test("landing from a store opened before another commit changes nothing", async () => {
  const stale = await build();
  const type = vectors.steps[0].holons[0].id;

  const apart = await openStore(memoryFiles(new Map(memoryOf(stale))));
  const theirs = (
    await commit(apart, {
      holons: [{ id: apart.minter()(), instance: [type], body: { text: "theirs" } }],
      says: "theirs",
    })
  ).store;

  const current = await openStore(stale.files);
  await commit(current, {
    holons: [{ id: current.minter()(), instance: [type], body: { text: "ours" } }],
    says: "ours",
  });

  await expect(land(stale, theirs)).rejects.toThrow("the store moved");
  expect((await (await openStore(stale.files)).log()).map(({ says }) => says)).toContain("ours");
});

test("one holon cannot be written twice in one commit", async () => {
  const store = await build();
  const holon = vectors.steps[0].holons[1];

  await expect(commit(store, { holons: [holon, holon], says: "twice" })).rejects.toThrow("written twice");
  expect((await (await openStore(store.files)).log()).length).toBe(2);
});

test("an empty store takes a copy, not a landing", async () => {
  await expect(land(await fresh(), await build())).rejects.toThrow("takes a copy");
});

test("what is forged or damaged is caught", async () => {
  const damaged = async (path: string, change: (content: string) => string) => {
    const store = await build();
    const held = new Map(memoryOf(store));

    held.set(path, new TextEncoder().encode(change(text(held.get(path)))));
    return memoryFiles(held);
  };

  const blockHash = Object.keys(vectors.steps[1].blocks)[0]!;
  const withBadBlock = await damaged(`blocks/${blockHash}.jsonl`, (content) =>
    content.replace("three", "thrее"),
  );
  await expect((await openStore(withBadBlock)).all()).rejects.toThrow("does not match");

  const withBadLog = await damaged("log/0.jsonl", (content) =>
    content.replace('"says":"first"', '"says":"forged"'),
  );
  await expect(openStore(withBadLog)).rejects.toThrow("breaks");

  const withBadRef = await damaged("refs/main", () => `${"f".repeat(64)} 0\n`);
  await expect(openStore(withBadRef)).rejects.toThrow("names no line");
});

test("past a block's size the log opens a volume, and its checkpoint alone reads the field", async () => {
  let store = await fresh();
  const long = "word ".repeat(3000);

  const type = store.minter()();
  store = (
    await commit(store, { holons: [{ id: type, instance: [], body: { text: "type" } }], says: "first" })
  ).store;

  const names: string[] = [];

  for (let i = 0; i < 6; i++) {
    const id = store.minter()();
    names.push(id);
    store = (
      await commit(store, { holons: [{ id, instance: [type], body: { text: `${i}` } }], says: `${long}${i}` })
    ).store;
  }

  expect(store.volume).toBeGreaterThan(0);

  const held = new Map(memoryOf(store));

  for (const path of [...held.keys()]) {
    if (path.startsWith("log/") && path !== `log/${store.volume}.jsonl`) held.delete(path);
  }

  const withoutOlderLog = await openStore(memoryFiles(held));

  expect([...(await withoutOlderLog.all()).keys()].sort()).toEqual([type, ...names].sort());

  const log = await store.fullLog();

  expect(log.length).toBe(7);
  expect((await store.allAt(3)).size).toBe(4);
  await expect(store.allAt(99)).rejects.toThrow("no commit 99");
  expect(await sha(log.at(-1)!.text)).toBe(store.head!);
});

test("a commit larger than a block is cut, its new ids still found", async () => {
  const store = await fresh();
  const mint = store.minter();
  const holons: Holon[] = Array.from({ length: 400 }, (_, i) => ({
    id: mint(),
    instance: [],
    body: { text: `${i} ${"x".repeat(500)}` },
  }));

  const { blocks, store: next } = await commit(store, { holons, says: "large" });

  expect(blocks).toBeGreaterThan(1);
  expect((await next.all()).size).toBe(400);

  for (const holon of [holons[0]!, holons[200]!, holons[399]!]) {
    expect((await next.read(holon.id))?.version.body.text).toBe(holon.body.text);
  }

  expect(await next.read("0".repeat(15))).toBe(null);
});

test("an empty store reads as empty", async () => {
  const store = await fresh();

  expect(store.head).toBe(null);
  expect((await store.all()).size).toBe(0);
  expect(await store.read("0".repeat(15))).toBe(null);
  expect(await store.log()).toEqual([]);
});

// Files holding what the vectors say, as a store's folder would.
const filesOf = ({ blocks, log, ref }: { blocks: Record<string, string>; log: string[]; ref: string }) =>
  memoryFiles(
    new Map([
      ...Object.entries(blocks).map(
        ([hash, content]) => [`blocks/${hash}.jsonl`, new TextEncoder().encode(content)] as const,
      ),
      ["log/0.jsonl", new TextEncoder().encode(`${log.join("\n")}\n`)] as const,
      ["refs/main", new TextEncoder().encode(ref)] as const,
    ]),
  );

test("lines written before read as they are, each act the same, and a commit lands after them", async () => {
  const { before } = vectors;
  const store = await openStore(filesOf(before));

  expect(await textsOf(store)).toEqual(before.field);
  expect((await store.log()).map(({ act }) => act)).toEqual(before.acts);

  const { after } = before;
  const { store: next } = await commit(store, after);

  expect(logOf(next)).toEqual(after.log);
  expect(text(memoryOf(next).get("refs/main"))).toBe(after.ref);

  for (const [hash, content] of Object.entries(after.block)) {
    expect(text(memoryOf(next).get(`blocks/${hash}.jsonl`))).toBe(content as string);
  }
});

test("an act across two stores is one act in each, its blocks each store's own", async () => {
  const { first, then } = vectors.act;
  const stores = [await fresh(), await fresh()];

  const done = await act(
    stores.map((store, i) => ({ store, holons: first.stores[i].holons })),
    { says: first.says, at: first.at, born: first.born },
  );

  expect(done.act).toBe(first.content);

  for (const [i, wanted] of first.stores.entries()) {
    const store = done.stores[i]!;

    for (const [hash, content] of Object.entries(wanted.block)) {
      expect(text(memoryOf(store).get(`blocks/${hash}.jsonl`))).toBe(content as string);
    }

    expect(logOf(store)).toEqual(wanted.log);
    expect(text(memoryOf(store).get("refs/main"))).toBe(wanted.ref);
    expect(await textsOf(await reopened(store))).toEqual(wanted.field);
    expect((await store.log()).map(({ act }) => act)).toEqual([first.content]);
  }

  const [a, b] = done.stores as [Store, Store];
  const [inA, inB, inBoth] = first.born as string[];

  expect([a.mayHold(inA!), a.mayHold(inB!), a.mayHold(inBoth!)]).toEqual([true, false, true]);
  expect([b.mayHold(inA!), b.mayHold(inB!), b.mayHold(inBoth!)]).toEqual([false, true, true]);
  expect(writtenBy((await a.log())[0]!)).toEqual([inA, inBoth]);

  const gone = await act(
    done.stores.map((store) => ({ store, holons: [] })),
    { says: then.says, at: then.at, gone: then.gone },
  );

  expect(gone.act).toBe(then.content);

  for (const [i, wanted] of then.stores.entries()) {
    expect(logOf(gone.stores[i]!)).toEqual(wanted.log);
    expect(text(memoryOf(gone.stores[i]!).get("refs/main"))).toBe(wanted.ref);
    expect(await textsOf(await reopened(gone.stores[i]!))).toEqual(wanted.field);
  }
});

test("an act's new ids are one run across every store, and none in a moment a store holds", async () => {
  const [a, b] = [await fresh(), await fresh()];
  const mint = a.minter();
  const [x, , z] = [mint(), mint(), mint()];

  await expect(
    act(
      [
        { store: a, holons: [{ id: x, instance: [], body: {} }] },
        { store: b, holons: [{ id: z, instance: [], body: {} }] },
      ],
      { says: "a gap" },
    ),
  ).rejects.toThrow("not one run");

  const { stores } = await act([{ store: a, holons: [{ id: x, instance: [], body: {} }] }], { says: "x" });

  await expect(
    act([{ store: stores[0]!, holons: [{ id: z, instance: [], body: {} }] }], { says: "again" }),
  ).rejects.toThrow("mint again");
});

test("a line that names both a predecessor and a parent is refused", async () => {
  const { before } = vectors;
  const [first] = before.log;
  const both = first.replace('"parent":null', '"parent":null,"predecessor":null');

  await expect(
    openStore(filesOf({ blocks: before.blocks, log: [both], ref: `${await sha(both)} 0\n` })),
  ).rejects.toThrow("both a predecessor and a parent");
});

test("what a commit cut into blocks brings in can be taken out, and stays out on reopening", async () => {
  const seed = (
    await commit(await fresh(), { holons: [{ id: "1M6XGF9K0000000", instance: [], body: {} }], says: "seed" })
  ).store;
  const mint = seed.minter();
  const holons: Holon[] = Array.from({ length: 600 }, (_, i) => ({
    id: mint(),
    instance: [],
    body: { text: `${i} ${"x".repeat(500)}` },
  }));
  const { store: large } = await commit(seed, { holons, says: "large" });
  const taken = [holons[0]!.id, holons[300]!.id, holons[599]!.id];
  const { store } = await commit(large, { holons: [], says: "taken", gone: taken });

  for (const id of taken) expect(await (await reopened(store)).read(id)).toBe(null);
  expect((await (await reopened(store)).all()).size).toBe(598);
});

test("an act refuses one store given twice, and one that touches no store", async () => {
  const store = await fresh();

  await expect(
    act(
      [
        { store, holons: [] },
        { store, holons: [] },
      ],
      { says: "twice" },
    ),
  ).rejects.toThrow("given twice");

  await expect(
    act(
      [
        { store, holons: [] },
        { store: await fresh(), holons: [] },
      ],
      { says: "nothing" },
    ),
  ).rejects.toThrow("touches no store");
});

test("what is taken out in a run is said as a run, and every id of it reads as gone", async () => {
  const { says, at, gone, log, ref, field, act: wanted } = vectors.goneRun;
  const { store, act: done } = await commit(await build(1), { holons: [], says, at, gone });

  expect(logOf(store)).toEqual(log);
  expect(text(memoryOf(store).get("refs/main"))).toBe(ref);
  expect(done).toBe(wanted);
  expect(await textsOf(await reopened(store))).toEqual(field);
  expect((await store.log()).at(-1)!.gone).toEqual(gone);
});

test("gone is said in maximal runs, read back whole, and a run that is no run refused", async () => {
  const first = "1M6XGF9K0000300";
  const ids = [first, nextId(first), nextId(nextId(first)), "1M6XGF9K0000400", "1M6XGFAM0000000"];

  expect(goneOf(ids)).toEqual([[first, 3], "1M6XGF9K0000400", "1M6XGFAM0000000"]);
  expect(goneIds(goneOf(ids))).toEqual(ids);
  expect(() => goneIds([[first, 1]])).toThrow("not one");
  expect(() => goneIds([[first, 1e9]])).toThrow("not one");
});

test("a checkpoint says what is gone in runs, and a store opened from it reads them gone", async () => {
  const store = await fresh();
  const mint = store.minter();
  const holons: Holon[] = Array.from({ length: 300 }, (_, i) => ({
    id: mint(),
    instance: [],
    body: { text: `${i} ${"x".repeat(300)}` },
  }));
  let next = (await commit(store, { holons, says: "many" })).store;
  next = (await commit(next, { holons: [], says: "most go", gone: holons.slice(0, 250).map(({ id }) => id) }))
    .store;

  // Lines past a block's size open a volume, whose checkpoint carries the runs.
  for (let i = 0; i < 40; i++) {
    next = (
      await commit(next, {
        holons: [{ ...holons[299]!, body: { text: `${i}` } }],
        says: `${i} ${"y".repeat(2000)}`,
      })
    ).store;
  }

  const volumes = [...memoryOf(next).keys()].filter((path) => path.startsWith("log/"));
  expect(volumes.length).toBeGreaterThan(1);

  const opened = await reopened(next);
  expect((await opened.all()).size).toBe(50);
  expect(await opened.read(holons[100]!.id)).toBe(null);
});
