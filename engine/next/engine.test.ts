import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sameThread, workers } from "../../runtime/runtime.ts";
import { contentOf, hashOf, partOf } from "../../stores/act.ts";
import type { Act, Head, Holon, Store } from "../../stores/store.ts";
import { folderStorages } from "../../stores/strata/storage/folder.ts";
import { strata } from "../../stores/strata/strata.ts";
import { buffer } from "../../stores/buffer/buffer.ts";
import { begun as bufferBegun, typed } from "../../stores/buffer/string.ts";
import { engine, type Answer, type Committed, type Engine, type Read } from "./engine.ts";
import type { Landed } from "./commit/land.ts";

const made: string[] = [];
afterAll(() => made.forEach((at) => rmSync(at, { recursive: true, force: true })));

const id = (n: number) => String(n).padStart(15, "0");
const ref = (n: number) => ({ $ref: id(n) });

// The language's store: the types function, store, use and the kinds of value, and the
// natives these tests call.
const natives = ["get", "map", "size", "log", "holon"];
const fn = (name: string) => id(10 + natives.indexOf(name));
const glass: Holon[] = [
  {
    id: id(1),
    instance: [],
    name: "function",
    mould: {
      native: { says: "its native", shape: "string", optional: true },
      input: { says: "its placeholders", shape: { list: "ref" }, holds: true, optional: true },
      reverse: { says: "the function it is the reverse of", shape: "ref", optional: true },
    },
    body: {},
  },
  {
    id: id(2),
    instance: [],
    name: "store",
    mould: {
      contents: { says: "what it holds", shape: { list: "ref" }, holds: true, optional: true },
      shape: { says: "the shape its field keeps", shape: "ref", optional: true },
    },
    body: {},
  },
  { id: id(3), instance: [id(2)], name: "glass", body: {} },
  {
    id: id(8),
    instance: [],
    name: "shape",
    mould: { admits: { says: "the types it admits", shape: { set: "ref" }, optional: true } },
    body: {},
  },
  { id: id(4), instance: [], name: "value", mould: {}, body: {} },
  {
    id: id(5),
    instance: [],
    name: "use",
    mould: {
      fn: { says: "the function it applies", shape: "ref", optional: true },
      args: { says: "what it gives the function", shape: "json" },
    },
    body: {},
  },
  { id: id(6), instance: [], name: "number", mould: {}, body: {} },
  { id: id(7), instance: [], name: "string", mould: {}, body: {} },
  ...natives.map((name) => ({ id: fn(name), instance: [id(1)], name, body: { native: name } })),
];

// The notes store: its root, and the type note.
const notes: Holon[] = [
  {
    id: id(100),
    instance: [],
    name: "note",
    mould: { text: { says: "what it says", shape: "string" } },
    body: {},
  },
  { id: id(101), instance: [id(2)], name: "notes", body: { contents: [{ $ref: id(100), $holds: true }] } },
];

// A read of uses of the natives, each carried under a handle after the holons given.
type Using = (name: string, ...args: unknown[]) => { $ref: string; $holds: true };

function reading(build: (use: Using) => unknown, carried: Holon[] = []): Read {
  const holons = [...carried];
  const use: Using = (name, ...args) => {
    holons.push({ id: `~${holons.length + 1}`, instance: [id(5)], body: { fn: { $ref: fn(name) }, args } });
    return { $ref: `~${holons.length}`, $holds: true };
  };
  return { gives: build(use), holons };
}

// A read of one use.
const asking = (name: string, ...args: unknown[]) => reading((use) => use(name, ...args));

function folder() {
  const at = mkdtempSync(join(tmpdir(), "glass-engine-"));
  made.push(at);
  return at;
}

// A store begun with these holons, as one act, its root the one of the type store.
async function begun(store: Store, holons: Holon[]) {
  const root = holons.find(({ instance }) => instance.includes(id(2)))!.id;
  const part = partOf(holons);
  const said = {
    when: "2026-11-16T00:00:00.000Z",
    at: [] as Act["at"],
    says: "begun",
    gone: [],
    parts: [[root, part && (await hashOf(part))]] as Act["parts"],
  };
  const reply = await store.offer({
    ...said,
    hash: await hashOf(contentOf(said)),
    own: root,
    holons,
    born: holons.map(({ id }) => id),
    over: null,
    touches: { ids: holons.map(({ id }) => id), addresses: [] },
  });
  if (!("accepted" in reply)) throw new Error(JSON.stringify(reply));
}

// An engine on one thread over the two stores, glass only read and notes written.
async function started(): Promise<Engine> {
  const [language, written] = [strata(folderStorages(folder())), strata(folderStorages(folder()))];
  await begun(language, glass);
  await begun(written, notes);

  const glassEngine = await engine({ workers: sameThread(), count: 2 });
  await glassEngine.mount("glass", language);
  await glassEngine.mount("notes", written, { write: true });
  return glassEngine;
}

const landed = (committed: Committed) => {
  if (!("landed" in committed)) throw new Error(JSON.stringify(committed));
  return committed as Landed;
};

const note = (text: unknown, at = {}, more = {}) => ({
  holons: [{ id: "~1", instance: [id(100)], body: { text } }] as Holon[],
  says: "a note",
  at,
  ...more,
});

describe("the engine", () => {
  test("a change is judged, given its ids, landed, and read back", async () => {
    const glassEngine = await started();
    const committed = landed(await glassEngine.commit(note("Glass holds holons")));
    const made = committed.ids["~1"]!;

    expect(Object.keys(committed.landed)).toEqual(["notes"]);
    expect(await glassEngine.read(asking("get", { $ref: made }, "text"))).toMatchObject({
      value: "Glass holds holons",
    });

    // Held by nothing in the change, it goes into the store's root.
    const contents = (await glassEngine.read(asking("get", ref(101), "contents"))) as Answer & {
      value: unknown[];
    };
    expect(contents.value).toContainEqual({ $ref: made });
  });

  test("a read answers with the heads of the stores it read", async () => {
    const glassEngine = await started();
    const answer = await glassEngine.read(asking("get", ref(100), "name"));

    expect(Object.keys(answer.at).sort()).toEqual(["glass", "notes"]);
    expect(answer.at.notes).toHaveProperty("commit");
  });

  test("a subscriber is answered again when a store it read moves", async () => {
    const glassEngine = await started();
    const heard: unknown[] = [];
    const { promise, resolve } = Promise.withResolvers<void>();

    const stop = await glassEngine.subscribe(asking("get", ref(101), "contents"), (answer) => {
      heard.push("value" in answer ? (answer.value as unknown[]).length : answer.problem);
      if (heard.length === 2) resolve();
    });
    await glassEngine.commit(note("heard"));
    await promise;
    stop();

    expect(heard).toEqual([1, 2]);
  });

  test("a subscriber hears its answers one at a time, in order, the last at the latest heads", async () => {
    const glassEngine = await started();
    const heard: number[] = [];
    let last: (() => void) | undefined;

    const stop = await glassEngine.subscribe(asking("get", ref(101), "contents"), (answer) => {
      heard.push("value" in answer ? (answer.value as unknown[]).length : -1);
      if (heard.at(-1) === 5) last?.();
    });
    const done = new Promise<void>((resolve) => (last = resolve));
    await Promise.all([1, 2, 3, 4].map((n) => glassEngine.commit(note(`note ${n}`))));
    await done;
    stop();

    expect(heard).toEqual([...heard].sort((a, b) => a - b));
    expect(heard.at(-1)).toBe(5);
  });

  test("a change breaking a rule is refused with every problem, said by its handles", async () => {
    const glassEngine = await started();
    const committed = await glassEngine.commit(note(5));

    expect(committed).toMatchObject({ refused: [{ rule: "bodyFits", id: "~1" }] });
  });

  test("untyped data is not wrong: a whole of no type lands, and is changed", async () => {
    const glassEngine = await started();
    const whole = (holds: unknown[], id = "~1") => ({
      holons: [{ id, instance: [], name: "kept", body: { holds } }] as Holon[],
      says: "a whole of no type",
      at: {},
    });
    const { ids } = landed(await glassEngine.commit(whole([])));

    expect("landed" in (await glassEngine.commit(whole([ref(100)], ids["~1"]!)))).toBe(true);
  });

  test("nothing goes into a store only read", async () => {
    const glassEngine = await started();
    const committed = await glassEngine.commit(note("not here", {}, { into: "glass" }));

    expect(committed).toMatchObject({
      refused: [
        { rule: "readOnlyRefuses", id: "~1", says: "it cannot go into glass, which is only read" },
        { rule: "readOnlyRefuses", id: id(3), says: "it belongs to glass, which is only read" },
      ],
    });
  });

  test("a head at gives must be one its store has had", async () => {
    const glassEngine = await started();
    const committed = await glassEngine.commit(
      note("seen", { notes: { act: "0".repeat(64), commit: "0".repeat(64) } }),
    );

    expect(committed).toMatchObject({ refused: [{ rule: "at" }] });
  });

  test("strict, a change is refused if what it touches moved since its at; else it is taken", async () => {
    const glassEngine = await started();
    const made = landed(await glassEngine.commit(note("first"))).ids["~1"]!;
    const { at } = await glassEngine.read(asking("get", { $ref: made }, "text"));

    const edit = (text: string, strict: boolean) => ({
      holons: [{ id: made, instance: [id(100)], body: { text } }] as Holon[],
      says: "an edit",
      at,
      strict,
    });

    landed(await glassEngine.commit(edit("second", false)));
    expect(await glassEngine.commit(edit("third", true))).toMatchObject({
      refused: [{ rule: "strict", id: made }],
    });
    landed(await glassEngine.commit(edit("third", false)));
    expect(await glassEngine.read(asking("get", { $ref: made }, "text"))).toMatchObject({
      value: "third",
    });
  });

  test("a commit keeps the heads its change was made from, of the stores it touches alone", async () => {
    const glassEngine = await started();
    const { at } = await glassEngine.read(asking("get", ref(100), "name"));
    landed(await glassEngine.commit(note("seen", at)));
    landed(await glassEngine.commit(note("unseen")));

    const log = (await glassEngine.read(asking("log", "notes"))) as Answer & {
      value: { says: string; at: unknown[] }[];
    };
    expect(log.value[0]!.at).toEqual([]);
    expect(log.value[1]!.at).toEqual([{ store: ref(101), head: at.notes }]);
  });

  test("changes that touch the same holon take turns, and both land", async () => {
    const glassEngine = await started();
    const made = landed(await glassEngine.commit(note("first"))).ids["~1"]!;
    const edit = (text: string) => ({
      holons: [{ id: made, instance: [id(100)], body: { text } }] as Holon[],
      says: text,
      at: {},
    });

    const both = await Promise.all([glassEngine.commit(edit("a")), glassEngine.commit(edit("b"))]);
    both.forEach(landed);
    expect(await glassEngine.read(asking("get", { $ref: made }, "text"))).toMatchObject({
      value: "b",
    });
  });

  test("on workers, with the stores reached over the wire, it reads and commits the same", async () => {
    const [languageAt, writtenAt] = [folder(), folder()];
    await begun(strata(folderStorages(languageAt)), glass);
    await begun(strata(folderStorages(writtenAt)), notes);

    const runtime = workers();
    const storeCode = new URL("../../stores/strata/machine.ts", import.meta.url);
    const glassEngine = await engine({ workers: runtime, count: 2 });
    await glassEngine.mount("glass", await runtime.run<Store>(storeCode, { folder: languageAt }));
    await glassEngine.mount("notes", await runtime.run<Store>(storeCode, { folder: writtenAt }), {
      write: true,
    });

    const made = landed(await glassEngine.commit(note("over the wire"))).ids["~1"]!;
    expect(await glassEngine.read(asking("get", { $ref: made }, "text"))).toMatchObject({
      value: "over the wire",
    });

    await glassEngine.unmount("glass");
    await glassEngine.unmount("notes");
  }, 20_000);
});

// A store as another, with some of its methods answering otherwise.
const otherwise = (store: Store, methods: Partial<Store>): Store => ({ ...store, ...methods });

// An engine on one thread over glass, read, and notes, written, with more stores mounted
// beside them as given, and how many workers.
async function startedWith(more: Record<string, Store> = {}, count = 2, write = false) {
  const [language, written] = [strata(folderStorages(folder())), strata(folderStorages(folder()))];
  await begun(language, glass);
  await begun(written, notes);

  const glassEngine = await engine({ workers: sameThread(), count });
  await glassEngine.mount("glass", language);
  await glassEngine.mount("notes", written, { write: true });
  for (const [name, store] of Object.entries(more)) await glassEngine.mount(name, store, { write });
  return glassEngine;
}

// The head a store stands at now.
const strataHead = async (store: Store) => {
  let head: Head | null = null;
  (await store.subscribe((now) => (head = now)))();
  return head as Head | null;
};

// A second written store, its root the one of the type store, holding one note.
const more: Holon[] = [
  { id: id(301), instance: [id(2)], name: "more", body: { contents: [{ $ref: id(302), $holds: true }] } },
  { id: id(302), instance: [id(100)], body: { text: "kept in more" } },
];

async function moreStore() {
  const store = strata(folderStorages(folder()));
  await begun(store, more);
  return store;
}

// A change editing a note in notes and the note in more, as one commit.
const across = (made: string, text: string) => ({
  holons: [
    { id: made, instance: [id(100)], body: { text } },
    { id: id(302), instance: [id(100)], body: { text } },
  ] as Holon[],
  says: "across",
  at: {},
});

const failing = () => Promise.reject(new Error("the storage is gone"));

describe("when things go wrong", () => {
  test("a store failing a read fails that read with its problem, and the engine reads on", async () => {
    let broken = true;
    const store = await moreStore();
    const glassEngine = await startedWith({
      more: otherwise(store, { read: (head, question) => (broken ? failing() : store.read(head, question)) }),
    });

    const answer = await Promise.race([
      glassEngine.read(asking("get", ref(100), "name")),
      Bun.sleep(2_000).then(() => ({ problem: "no answer within 2 s" })),
    ]);
    expect(answer).toMatchObject({ problem: expect.stringContaining("the storage is gone") });

    broken = false;
    expect(await glassEngine.read(asking("get", ref(100), "name"))).toMatchObject({ value: "note" });
  });

  test("a commit across two stores, one taking it and one refusing, says where it landed and what the other answered", async () => {
    const store = await moreStore();
    const refusing = otherwise(store, {
      offer: async () => ({ refused: [{ rule: "full", says: "this store takes nothing more" }] }),
    });
    const glassEngine = await startedWith({ more: refusing }, 2, true);
    const made = landed(await glassEngine.commit(note("first", {}, { into: "notes" }))).ids["~1"]!;

    const committed = landed(await glassEngine.commit(across(made, "both")));
    expect(Object.keys(committed.landed)).toEqual(["notes"]);
    expect(committed.missed).toEqual({
      more: { refused: [{ rule: "full", says: "this store takes nothing more" }] },
    });
    expect(await glassEngine.read(asking("get", { $ref: made }, "text"))).toMatchObject({
      value: "both",
    });
  });

  test("a commit across two stores, one failing as it is offered, still says where it landed", async () => {
    const store = await moreStore();
    const glassEngine = await startedWith({ more: otherwise(store, { offer: failing }) }, 2, true);
    const made = landed(await glassEngine.commit(note("first", {}, { into: "notes" }))).ids["~1"]!;

    const committed = landed(await glassEngine.commit(across(made, "both")));
    expect(Object.keys(committed.landed)).toEqual(["notes"]);
    expect(committed.missed).toEqual({ more: { failed: "the storage is gone" } });
  });

  test("a store answering changed every time has the change refused after three judgings", async () => {
    let offered = 0;
    const store = await moreStore();
    const glassEngine = await startedWith({}, 2);
    const { at } = await glassEngine.read(asking("get", ref(302), "text"));

    // more answers every offer as changed, at a head it has had.
    const head = (await strataHead(store))!;
    await glassEngine.mount(
      "more",
      otherwise(store, {
        offer: async () => {
          offered++;
          return { changed: head };
        },
      }),
      { write: true },
    );

    expect(at).not.toHaveProperty("more");
    expect(await glassEngine.commit(note("never", {}, { into: "more" }))).toMatchObject({
      refused: [{ rule: "changed" }],
    });
    expect(offered).toBe(3);
  });

  test("a subscriber standing on a store unmounted is answered again without it", async () => {
    const glassEngine = await startedWith({ more: await moreStore() });
    const heard: string[][] = [];
    const { promise, resolve } = Promise.withResolvers<void>();

    const stop = await glassEngine.subscribe(asking("get", ref(302), "text"), (answer) => {
      heard.push(Object.keys(answer.at).sort());
      if (heard.length === 2) resolve();
    });
    await Bun.sleep(50);
    await glassEngine.unmount("more");
    await promise;
    stop();

    expect(heard).toEqual([
      ["glass", "more", "notes"],
      ["glass", "notes"],
    ]);
  });
});

describe("changes at once", () => {
  test("many changes touching different holons all land, each once", async () => {
    const glassEngine = await startedWith({}, 4);
    const all = await Promise.all(
      Array.from({ length: 40 }, (_, n) => glassEngine.commit(note(`note ${n}`))),
    );
    all.forEach(landed);

    const log = (await glassEngine.read(reading((use) => use("size", use("log", "notes"))))) as Answer;
    expect(log).toMatchObject({ value: 41 });
    const contents = (await glassEngine.read(
      reading((use) => use("size", use("get", ref(101), "contents"))),
    )) as Answer;
    expect(contents).toMatchObject({ value: 41 });
  });

  test("two holons given one name in one whole at once: one lands, the other is refused", async () => {
    const glassEngine = await startedWith({}, 4);
    const named = (text: string) => ({
      holons: [{ id: "~1", instance: [id(100)], name: "Same", body: { text } }] as Holon[],
      says: text,
      at: {},
    });

    const both = await Promise.all([glassEngine.commit(named("a")), glassEngine.commit(named("b"))]);
    expect(both.filter((one) => "landed" in one)).toHaveLength(1);
    expect(both.filter((one) => "refused" in one)).toHaveLength(1);
  });

  test("two engines over one storage, editing one holon at once, both land, one after the other", async () => {
    const [languageAt, writtenAt] = [folder(), folder()];
    await begun(strata(folderStorages(languageAt)), glass);
    await begun(strata(folderStorages(writtenAt)), notes);

    const engines = await Promise.all(
      [1, 2].map(async () => {
        const one = await engine({ workers: sameThread(), count: 2 });
        await one.mount("glass", strata(folderStorages(languageAt)));
        await one.mount("notes", strata(folderStorages(writtenAt)), { write: true });
        return one;
      }),
    );
    const made = landed(await engines[0]!.commit(note("first"))).ids["~1"]!;

    // The second engine hears of the first one's commit as the storage's head moves.
    while (
      !("value" in (await engines[1]!.read(asking("get", { $ref: made }, "text")))) ||
      ((await engines[1]!.read(asking("get", { $ref: made }, "text"))) as { value: unknown }).value === null
    )
      await Bun.sleep(10);

    const edit = (text: string, strict = false) => ({
      holons: [{ id: made, instance: [id(100)], body: { text } }] as Holon[],
      says: text,
      at: {},
      strict,
    });

    const both = await Promise.all([engines[0]!.commit(edit("a")), engines[1]!.commit(edit("b"))]);
    both.forEach(landed);

    // Each engine hears of the other's commit as the storage's head moves.
    const newest = async (one: Engine) => {
      const log = (await one.read(asking("log", "notes"))) as unknown as {
        value: { says: string }[];
      };
      return log.value.slice(0, 2).map(({ says }) => says);
    };
    while (
      (await newest(engines[0]!)).sort().join() !== "a,b" ||
      (await newest(engines[1]!)).sort().join() !== "a,b"
    )
      await Bun.sleep(10);
    const [last] = await newest(engines[1]!);
    const text = await engines[0]!.read(asking("get", { $ref: made }, "text"));
    expect(text).toMatchObject({ value: last });
  });
});

describe("reads carrying holons", () => {
  const carried = { id: "~1", instance: [id(100)], body: { text: "kept nowhere" } } as Holon;

  test("a read gives a value as it is", async () => {
    const glassEngine = await started();
    expect(await glassEngine.read({ gives: 3 })).toMatchObject({ value: 3 });
  });

  test("a handle is found among the read's holons, never asked of the stores", async () => {
    const glassEngine = await started();
    const read = (key: string) => reading((use) => use("get", { $ref: "~1" }, key), [carried]);

    expect(await glassEngine.read(read("text"))).toMatchObject({ value: "kept nowhere" });
    expect(await glassEngine.read(read("store"))).toMatchObject({ value: "read" });
  });

  test("a handle the read carries no holon for is a problem", async () => {
    const glassEngine = await started();
    const answer = await glassEngine.read(reading((use) => use("get", { $ref: "~9" }, "text"), [carried]));

    expect(answer).toMatchObject({ problem: "the handle ~9 names no holon the read carries" });
  });

  test("a subscriber to a read carrying holons is answered again when a store it read moves", async () => {
    const glassEngine = await started();
    const heard: unknown[] = [];
    const { promise, resolve } = Promise.withResolvers<void>();
    const read = reading(
      (use) => [use("get", { $ref: "~1" }, "text"), use("size", use("get", ref(101), "contents"))],
      [carried],
    );

    const stop = await glassEngine.subscribe(read, (answer) => {
      heard.push("value" in answer ? answer.value : answer.problem);
      if (heard.length === 2) resolve();
    });
    await glassEngine.commit(note("heard"));
    await promise;
    stop();

    expect(heard).toEqual([
      ["kept nowhere", 1],
      ["kept nowhere", 2],
    ]);
  });
});

describe("placeholders", () => {
  // A function taking two placeholders, the second optional, as one change.
  const taking = (second: object) => ({
    holons: [
      { id: "~1", instance: [id(1)], name: "pair", body: { input: [{ $ref: "~2" }, second] } },
      { id: "~2", instance: [id(4)], name: "first", body: {} },
      { id: "~3", instance: [id(4)], name: "second", body: {} },
    ] as Holon[],
    says: "a function of two placeholders",
    at: {},
  });

  test("a function holds its placeholders in a list, each marked optional or not, and they reside with it", async () => {
    const glassEngine = await started();
    const { ids } = landed(await glassEngine.commit(taking({ $ref: "~3", $optional: true })));

    const pair = (await glassEngine.read(asking("holon", { $ref: ids["~1"]! }))) as Answer & {
      value: Holon & { store: string };
    };
    expect(pair.value.store).toBe("notes");
    expect(pair.value.body.input).toEqual([
      { $ref: ids["~2"], $holds: true },
      { $ref: ids["~3"], $holds: true, $optional: true },
    ]);

    // Held by the function, the placeholders are not loose in the store's root.
    const contents = (await glassEngine.read(asking("get", ref(101), "contents"))) as Answer & {
      value: unknown[];
    };
    expect(contents.value).toEqual([{ $ref: id(100) }, { $ref: ids["~1"] }]);
  });

  test("$optional anywhere but on an entry of the list at input is refused", async () => {
    const glassEngine = await started();

    const optional = { $ref: id(100), $holds: true, $optional: true };
    const committed = await glassEngine.commit({
      holons: [{ id: id(101), instance: [id(2)], name: "notes", body: { contents: [optional] } }],
      says: "an optional part",
      at: {},
    });

    expect(committed).toMatchObject({ refused: [{ rule: "optionalOnlyInInput", id: id(101) }] });
  });
});

describe("names in a whole", () => {
  const named = (name: string, text = name) => ({
    holons: [{ id: "~1", instance: [id(100)], name, body: { text } }] as Holon[],
    says: name,
    at: {},
  });

  test("a name a whole already holds is refused, said of the handle", async () => {
    const glassEngine = await started();
    landed(await glassEngine.commit(named("Same")));

    expect(await glassEngine.commit(named("Same", "again"))).toMatchObject({
      refused: [{ rule: "namesAreOne", id: "~1", says: `${id(101)} already holds a holon named "Same"` }],
    });
  });

  test("a part renamed to a name its whole holds is refused; to a free one it lands", async () => {
    const glassEngine = await started();
    landed(await glassEngine.commit(named("Taken")));
    const other = landed(await glassEngine.commit(named("Other"))).ids["~1"]!;
    const renamed = (name: string) => ({
      holons: [{ id: other, instance: [id(100)], name, body: { text: "Other" } }] as Holon[],
      says: "renamed",
      at: {},
    });

    expect(await glassEngine.commit(renamed("Taken"))).toMatchObject({
      refused: [{ rule: "namesAreOne", id: other }],
    });
    landed(await glassEngine.commit(renamed("Free")));
  });

  test("a whole letting go of a part and taking another of the same name lands", async () => {
    const glassEngine = await started();
    const first = landed(await glassEngine.commit(named("Same"))).ids["~1"]!;
    const root = (await glassEngine.read(asking("get", ref(101), "contents"))) as Answer & {
      value: unknown[];
    };

    const committed = await glassEngine.commit({
      holons: [
        {
          id: id(101),
          instance: [id(2)],
          name: "notes",
          body: {
            contents: [
              ...root.value.filter((each) => (each as { $ref: string }).$ref !== first),
              { $ref: "~1", $holds: true },
            ],
          },
        },
        { id: "~1", instance: [id(100)], name: "Same", body: { text: "the new one" } },
      ] as Holon[],
      gone: [first],
      says: "replaced",
      at: {},
    });
    landed(committed);
  });

  test("two parts of one name placed at once in one whole are refused", async () => {
    const glassEngine = await started();
    const committed = await glassEngine.commit({
      holons: [
        { id: "~1", instance: [id(100)], name: "Twin", body: { text: "one" } },
        { id: "~2", instance: [id(100)], name: "Twin", body: { text: "two" } },
      ] as Holon[],
      says: "twins",
      at: {},
    });

    expect(committed).toMatchObject({ refused: [{ rule: "namesAreOne", id: "~2" }] });
  });
});

describe("uses", () => {
  // A function of a number, an optional string and a note, each a placeholder of its
  // type; the note's, of a type with a field required, held empty.
  async function pairing() {
    const glassEngine = await started();
    const { ids } = landed(
      await glassEngine.commit({
        holons: [
          {
            id: "~1",
            instance: [id(1)],
            name: "pair",
            body: {
              input: [{ $ref: "~2" }, { $ref: "~3", $optional: true }, { $ref: "~4" }],
            },
          },
          { id: "~2", instance: [id(6)], name: "first", body: {} },
          { id: "~3", instance: [id(7)], name: "second", body: {} },
          { id: "~4", instance: [id(100)], name: "third", body: {} },
          { id: "~5", instance: [id(100)], name: "a note", body: { text: "kept" } },
        ] as Holon[],
        says: "a function of three placeholders, and a note",
        at: {},
      }),
    );
    const using = (...args: unknown[]) =>
      glassEngine.commit({
        holons: [{ id: "~1", instance: [id(5)], body: { fn: { $ref: ids["~1"]! }, args } }] as Holon[],
        says: "a use of pair",
        at: {},
      });

    return { glassEngine, ids, using };
  }

  test("a placeholder of a type with fields required is taken empty: it is a hole of its type", async () => {
    const { glassEngine, ids } = await pairing();
    const third = { id: ids["~4"]!, instance: [id(100)], name: "the third", body: {} };

    expect("landed" in (await glassEngine.commit({ holons: [third], says: "renamed", at: {} }))).toBe(true);
    expect(
      await glassEngine.commit({ holons: [note(undefined).holons[0]!], says: "a note", at: {} }),
    ).toMatchObject({ refused: [{ rule: "bodyFits" }] });
    expect(
      await glassEngine.commit({ holons: [{ ...third, body: { text: "filled" } }], says: "filled", at: {} }),
    ).toMatchObject({ refused: [{ rule: "placeholdersAreHoles", id: ids["~4"] }] });
  });

  test("a use is taken where its args fit, an optional passed over where the next does not fit it", async () => {
    const { ids, using } = await pairing();
    const kept = { $ref: ids["~5"]! };

    expect("landed" in (await using(1, kept))).toBe(true);
    expect("landed" in (await using(1, "two", kept))).toBe(true);
  });

  test("a use is refused given too many args, or too few", async () => {
    const { ids, using } = await pairing();

    expect(await using(1, "two", { $ref: ids["~5"]! }, 4)).toMatchObject({
      refused: [{ rule: "argsFitInput", id: "~1", says: "it gives pair 4 args, and pair takes at most 3" }],
    });
    expect(await using(1)).toMatchObject({
      refused: [{ rule: "argsFitInput", says: "it gives pair 1 arg, and pair takes at least 2" }],
    });
  });

  test("a use is refused an arg not of its placeholder's type, a literal or a holon", async () => {
    const { ids, using } = await pairing();

    expect(await using("one", { $ref: ids["~5"]! })).toMatchObject({
      refused: [{ rule: "argsFitInput", says: 'it gives pair "one" for first, which takes a number' }],
    });
    expect(await using(1, { $ref: id(101) })).toMatchObject({
      refused: [{ rule: "argsFitInput", says: "it gives pair @notes for third, which takes a note" }],
    });
  });

  test("a use applies a function, or names none for what shows it to find", async () => {
    const { glassEngine } = await pairing();
    const use = (body: object) =>
      glassEngine.commit({
        holons: [{ id: "~1", instance: [id(5)], body }] as Holon[],
        says: "a use",
        at: {},
      });

    expect(await use({ fn: { $ref: id(101) }, args: [] })).toMatchObject({
      refused: [{ rule: "argsFitInput", says: "it applies notes, which is not a function" }],
    });
    expect("landed" in (await use({ args: [] }))).toBe(true);
    expect("landed" in (await use({ fn: { $ref: fn("size") }, args: [1, 2, 3] }))).toBe(true);
  });
});

describe("pairs", () => {
  // Functions as one change, each by its handle naming the reverse given, if any.
  const functions = (...reverses: (string | undefined)[]) => ({
    holons: reverses.map((reverse, i) => ({
      id: `~${i + 1}`,
      instance: [id(1)],
      name: `f${i + 1}`,
      body: { native: `f${i + 1}`, ...(reverse && { reverse: { $ref: reverse } }) },
    })) as Holon[],
    says: "functions",
    at: {},
  });

  test("two functions naming each other are a pair", async () => {
    const glassEngine = await started();
    landed(await glassEngine.commit(functions("~2", "~1")));
  });

  test("a function naming a reverse that does not name it back, or is no function, is refused", async () => {
    const glassEngine = await started();

    expect(await glassEngine.commit(functions("~2", undefined))).toMatchObject({
      refused: [
        {
          rule: "pairsNameEachOther",
          id: "~1",
          says: "its reverse f2 does not name it back: two functions are a pair only where each names the other",
        },
        {
          rule: "pairsNameEachOther",
          id: "~2",
          says: "f1 names it as its reverse, and it does not name f1 back",
        },
      ],
    });
    expect(await glassEngine.commit(functions(id(100)))).toMatchObject({
      refused: [{ rule: "pairsNameEachOther", id: "~1", says: "its reverse note is not a function" }],
    });
  });

  test("one of a pair letting go of the other is refused while the other still names it", async () => {
    const glassEngine = await started();
    const { ids } = landed(await glassEngine.commit(functions("~2", "~1")));
    const alone = { id: ids["~2"]!, instance: [id(1)], name: "f2", body: { native: "f2" } };

    expect(await glassEngine.commit({ holons: [alone], says: "alone", at: {} })).toMatchObject({
      refused: [
        {
          rule: "pairsNameEachOther",
          id: ids["~2"],
          says: "f1 names it as its reverse, and it does not name f1 back",
        },
      ],
    });
  });
});

describe("a buffer", () => {
  // An engine on one thread over glass, read, and a string buffer named bar, written,
  // begun through the engine: the id of the holon its string is kept in.
  async function typing() {
    const language = strata(folderStorages(folder()));
    await begun(language, glass);

    const glassEngine = await engine({ workers: sameThread(), count: 2 });
    await glassEngine.mount("glass", language);
    await glassEngine.mount("bar", buffer(), { write: true });
    const query = landed(await glassEngine.commit(bufferBegun("bar", { store: id(2), shape: id(8) }))).ids["~2"]!;
    return { glassEngine, query };
  }

  test("text committed into it is read back as a string", async () => {
    const { glassEngine, query } = await typing();
    landed(await glassEngine.commit(typed(query, "get(@1, ")));

    expect(await glassEngine.read(asking("get", { $ref: query }, "text"))).toMatchObject({
      value: "get(@1, ",
    });
  });

  test("a subscribed read runs again on every change, and nothing of earlier text is kept", async () => {
    const { glassEngine, query } = await typing();
    const heard: unknown[] = [];
    let done: () => void = () => {};
    const all = new Promise<void>((resolve) => (done = resolve));

    const stop = await glassEngine.subscribe(asking("get", { $ref: query }, "text"), (answer) => {
      heard.push("value" in answer ? answer.value : answer.problem);
      if (heard.at(-1) === "gla") done();
    });
    for (const text of ["g", "gl", "gla"]) landed(await glassEngine.commit(typed(query, text)));
    await all;
    stop();

    // Each answer the text as it then stood, in the order it was typed.
    const typedAt = (text: unknown) => ["", "g", "gl", "gla"].indexOf(text as string);
    expect(heard[0]).toBe("");
    expect(heard.map(typedAt)).toEqual(heard.map(typedAt).sort());
    expect(heard.length).toBeGreaterThan(2);
    expect(await glassEngine.read(asking("log", "bar"))).toMatchObject({ value: [expect.anything()] });
  });

  test("from an earlier head a change is taken, but strict it is refused as moved", async () => {
    const { glassEngine, query } = await typing();
    const { at } = await glassEngine.read(asking("get", { $ref: query }, "text"));
    landed(await glassEngine.commit(typed(query, "g", at)));

    // The buffer keeps nothing of how it stood at at, so cannot say nothing moved.
    expect(await glassEngine.commit({ ...typed(query, "gl", at), strict: true })).toEqual({
      refused: [
        { rule: "strict", id: query, says: "bar keeps only the present, so cannot tell what moved since" },
      ],
    });

    landed(await glassEngine.commit(typed(query, "gl", at)));
    const now = (await glassEngine.read(asking("get", { $ref: query }, "text"))) as Answer;
    landed(await glassEngine.commit({ ...typed(query, "gla", now.at), strict: true }));

    expect(await glassEngine.read(asking("get", { $ref: query }, "text"))).toMatchObject({ value: "gla" });
  });
});
