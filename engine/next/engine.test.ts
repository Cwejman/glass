import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Expression } from "../../language/expression.ts";
import { sameThread, workers } from "../../runtime/runtime.ts";
import { contentOf, hashOf, partOf } from "../../stores/act.ts";
import type { Act, Holon, Store } from "../../stores/store.ts";
import { folderStorage } from "../../stores/strata/storage/folder.ts";
import { strata } from "../../stores/strata/strata.ts";
import { engine, type Answer, type Committed, type Engine } from "./engine.ts";
import type { Landed } from "./commit/land.ts";

const made: string[] = [];
afterAll(() => made.forEach((at) => rmSync(at, { recursive: true, force: true })));

const id = (n: number) => String(n).padStart(15, "0");
const ref = (n: number) => ({ $ref: id(n) });

// The language's store: the types function and store, and the natives these tests call.
const natives = ["get", "map", "size", "log"];
const fn = (name: string) => id(10 + natives.indexOf(name));
const glass: Holon[] = [
  {
    id: id(1),
    instance: [],
    name: "function",
    mould: { native: { says: "its native", shape: "string" } },
    body: {},
  },
  {
    id: id(2),
    instance: [],
    name: "store",
    mould: { contents: { says: "what it holds", shape: { list: "ref" }, holds: true, optional: true } },
    body: {},
  },
  { id: id(3), instance: [id(2)], name: "glass", body: {} },
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

const call = (name: string, ...given: Expression[]): Expression => ({
  call: { $ref: fn(name) },
  with: given,
});

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
  const [language, written] = [strata(folderStorage(folder())), strata(folderStorage(folder()))];
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
    expect(await glassEngine.read(call("get", { $ref: made }, "text"))).toMatchObject({
      value: "Glass holds holons",
    });

    // Held by nothing in the change, it goes into the store's root.
    const contents = (await glassEngine.read(call("get", ref(101), "contents"))) as Answer & {
      value: unknown[];
    };
    expect(contents.value).toContainEqual({ $ref: made });
  });

  test("a read answers with the heads of the stores it read", async () => {
    const glassEngine = await started();
    const answer = await glassEngine.read(call("get", ref(100), "name"));

    expect(Object.keys(answer.at).sort()).toEqual(["glass", "notes"]);
    expect(answer.at.notes).toHaveProperty("commit");
  });

  test("a subscriber is answered again when a store it read moves", async () => {
    const glassEngine = await started();
    const heard: unknown[] = [];
    const { promise, resolve } = Promise.withResolvers<void>();

    await glassEngine.subscribe(call("get", ref(101), "contents"), (answer) => {
      heard.push("value" in answer ? (answer.value as unknown[]).length : answer.problem);
      if (heard.length === 2) resolve();
    });
    await glassEngine.commit(note("heard"));
    await promise;

    expect(heard).toEqual([1, 2]);
  });

  test("a subscriber hears its answers one at a time, in order, the last at the latest heads", async () => {
    const glassEngine = await started();
    const heard: number[] = [];
    let last: (() => void) | undefined;

    await glassEngine.subscribe(call("get", ref(101), "contents"), (answer) => {
      heard.push("value" in answer ? (answer.value as unknown[]).length : -1);
      if (heard.at(-1) === 5) last?.();
    });
    const done = new Promise<void>((resolve) => (last = resolve));
    await Promise.all([1, 2, 3, 4].map((n) => glassEngine.commit(note(`note ${n}`))));
    await done;

    expect(heard).toEqual([...heard].sort((a, b) => a - b));
    expect(heard.at(-1)).toBe(5);
  });

  test("a change breaking a rule is refused with every problem, said by its handles", async () => {
    const glassEngine = await started();
    const committed = await glassEngine.commit(note(5));

    expect(committed).toMatchObject({ refused: [{ rule: "bodyFits", id: "~1" }] });
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
    const { at } = await glassEngine.read(call("get", { $ref: made }, "text"));

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
    expect(await glassEngine.read(call("get", { $ref: made }, "text"))).toMatchObject({ value: "third" });
  });

  test("a commit keeps the heads its change was made from, of the stores it touches alone", async () => {
    const glassEngine = await started();
    const { at } = await glassEngine.read(call("get", ref(100), "name"));
    landed(await glassEngine.commit(note("seen", at)));
    landed(await glassEngine.commit(note("unseen")));

    const log = (await glassEngine.read(call("log", "notes"))) as Answer & {
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
    expect(await glassEngine.read(call("get", { $ref: made }, "text"))).toMatchObject({ value: "b" });
  });

  test("on workers, with the stores reached over the wire, it reads and commits the same", async () => {
    const [languageAt, writtenAt] = [folder(), folder()];
    await begun(strata(folderStorage(languageAt)), glass);
    await begun(strata(folderStorage(writtenAt)), notes);

    const runtime = workers();
    const storeCode = new URL("../../stores/strata/machine.ts", import.meta.url);
    const glassEngine = await engine({ workers: runtime, count: 2 });
    await glassEngine.mount("glass", await runtime.run<Store>(storeCode, { folder: languageAt }));
    await glassEngine.mount("notes", await runtime.run<Store>(storeCode, { folder: writtenAt }), {
      write: true,
    });

    const made = landed(await glassEngine.commit(note("over the wire"))).ids["~1"]!;
    expect(await glassEngine.read(call("get", { $ref: made }, "text"))).toMatchObject({
      value: "over the wire",
    });

    await glassEngine.unmount("glass");
    await glassEngine.unmount("notes");
  }, 20_000);
});
