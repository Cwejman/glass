import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Expression, Value } from "../../../language/expression.ts";
import { contentOf, hashOf, partOf } from "../../../stores/act.ts";
import type { Act, Head, Holon, Store } from "../../../stores/store.ts";
import { folderStorage } from "../../../stores/strata/storage/folder.ts";
import { strata } from "../../../stores/strata/strata.ts";
import { evaluate } from "./evaluate.ts";

const made: string[] = [];
afterAll(() => made.forEach((at) => rmSync(at, { recursive: true, force: true })));

const id = (n: number) => String(n).padStart(15, "0");
const ref = (n: number, holds = false) => (holds ? { $ref: id(n), $holds: true } : { $ref: id(n) });

// A store holding these holons, taken as one act, and its head.
async function storeOf(root: string, holons: Holon[]): Promise<{ store: Store; head: Head | null }> {
  const folder = mkdtempSync(join(tmpdir(), "glass-read-"));
  made.push(folder);
  const store = strata(folderStorage(folder));
  if (!holons.length) return { store, head: null };

  const part = partOf(holons);
  const said = {
    when: "2026-11-16T00:00:00.000Z",
    at: [] as Act["at"],
    says: "a test",
    gone: [],
    parts: [[root, part && (await hashOf(part))]] as Act["parts"],
  };
  const reply = await store.offer({
    ...said,
    hash: await hashOf(contentOf(said)),
    own: root,
    holons,
    born: holons.map((holon) => holon.id),
    over: null,
    touches: { ids: holons.map((holon) => holon.id), addresses: [] },
  });
  if (!("accepted" in reply)) throw new Error(JSON.stringify(reply));
  return { store, head: reply.accepted };
}

// The language's own store: the type function, and the natives these tests call.
const natives = [
  "add",
  "map",
  "get",
  "in",
  "out",
  "find",
  "said",
  "not",
  "everything",
  "log",
  "children",
  "size",
  "whole",
];
const fn = (name: string) => id(10 + natives.indexOf(name));
const language: Holon[] = [
  { id: id(1), instance: [], name: "function", mould: { native: { says: "", shape: "string" } }, body: {} },
  ...natives.map((name) => ({ id: fn(name), instance: [id(1)], name, body: { native: name } })),
];

// A field of two stores: notes refers into home, which holds it.
const type = { id: id(100), instance: [], name: "note", mould: {}, body: {} };
const note = { id: id(101), instance: [id(100)], name: "Notes", body: { text: "Glass holds holons" } };
const home = { id: id(200), instance: [], name: "Home", body: { parts: [ref(101, true)], see: ref(100) } };

const call = (name: string, ...given: Expression[]): Expression => ({
  call: { $ref: fn(name) },
  with: given,
});
const v = (name: string) => ({ "?": name });

async function field(more: { name: string; holons: Holon[] }[] = []) {
  const all = [
    { name: "glass", holons: language },
    { name: "notes", holons: [type, note] },
    { name: "home", holons: [home] },
    ...more,
  ];
  const stores = new Map<string, { store: Store }>();
  const heads: Record<string, Head | null> = {};

  // How many questions of each kind the stores were asked.
  const asked: Record<string, number> = {};

  for (const { name, holons } of all) {
    const { store, head } = await storeOf(name, holons);
    const counted: Store = {
      ...store,
      read: (head, question) => {
        const kind = Object.keys(question)[0]!;
        asked[kind] = (asked[kind] ?? 0) + 1;
        return store.read(head, question);
      },
    };
    stores.set(name, { store: counted });
    heads[name] = head;
  }

  // A read's answer, its value or its problem, and the stores it asked.
  const reading = (expression: Expression) =>
    evaluate(expression, stores, heads) as Promise<{ value?: Value; problem?: string; asked: string[] }>;
  return Object.assign(reading, { asked });
}

describe("reading over stores", () => {
  test("values, lists and lambdas are worked out as ever", async () => {
    const read = await field();
    const twice = { fn: ["x"], gives: call("add", { var: "x" }, { var: "x" }) };

    expect((await read(call("map", { list: [1, 2, 3] }, twice))).value).toEqual([2, 4, 6]);
  });

  test("a holon is read from the store that keeps it, and says so", async () => {
    const read = await field();

    expect((await read(call("get", ref(101), "store"))).value).toBe("notes");
    expect((await read(call("get", ref(101), "text"))).value).toBe("Glass holds holons");
    expect((await read(call("get", ref(999), "text"))).value).toBeNull();
  });

  test("a whole is asked of the store keeping it in one question, and its parts in other stores read as any holon", async () => {
    const read = await field();
    const answer = await read(call("whole", ref(200)));

    expect(Object.keys((answer.value as { holons: object }).holons).sort()).toEqual([id(101), id(200)]);
    expect(read.asked.whole).toBe(1);
  });

  test("an answer names the stores it asked", async () => {
    const read = await field();

    expect((await read(call("add", 1, 2))).asked).toEqual(["glass"]);
    expect((await read(call("get", ref(101), "text"))).asked.sort()).toEqual(["glass", "home", "notes"]);
  });

  test("what refers to a holon is found in every store", async () => {
    const read = await field();

    expect((await read(call("in", ref(101)))).value).toEqual([{ key: "parts", from: ref(200), holds: true }]);
    expect((await read(call("children", ref(200)))).value).toEqual([ref(101)]);
  });

  test("a pattern is joined across stores", async () => {
    const read = await field();
    const found = call(
      "find",
      { record: { whole: v("w"), part: v("p") } },
      { list: [v("w"), "$holds", v("p")] },
      { list: [v("p"), "instance", ref(100)] },
    );

    expect((await read(found)).value).toEqual([{ whole: ref(200), part: ref(101) }]);
  });

  test("a word said is found under its key, and not is held to what was found", async () => {
    const read = await field();
    const saying = (word: string) => call("find", v("h"), call("said", v("h"), "text", word));

    expect((await read(saying("HOLDS"))).value).toEqual([ref(101)]);
    expect(
      (
        await read(
          call(
            "find",
            v("h"),
            { list: [v("h"), "name", v("n")] },
            call("not", { list: [v("h"), "instance", ref(1)] }),
            call("not", { list: [v("h"), "instance", ref(100)] }),
          ),
        )
      ).value,
    ).toEqual([ref(1), ref(100), ref(200)]);
  });

  test("a store not yet written holds nothing, and is asked all the same", async () => {
    const read = await field([{ name: "empty", holons: [] }]);
    const answer = await read(call("get", ref(999), "text"));

    expect(answer.value).toBeNull();
    expect(answer.asked).toContain("empty");
  });

  test("a store's log is its commits, newest first", async () => {
    const read = await field();

    expect((await read(call("size", call("log", "notes")))).value).toBe(1);
    expect((await read(call("log", "nowhere"))).value).toEqual([]);
  });

  test("what would scan every holon is refused, saying what to write instead", async () => {
    const read = await field();

    expect(await read(call("everything"))).toMatchObject({
      problem: expect.stringContaining("scanned every holon"),
    });
  });
});
