import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Expression } from "../../../language/expression.ts";
import { sameThread } from "../../../runtime/runtime.ts";
import { contentOf, hashOf, partOf } from "../../../stores/act.ts";
import type { Act, Holon, Store } from "../../../stores/store.ts";
import { folderStorage } from "../../../stores/strata/storage/folder.ts";
import { strata } from "../../../stores/strata/strata.ts";
import { engine } from "../engine.ts";
import {
  migrate,
  mountUse,
  takesToInput,
  usesOf,
  writtenAgain,
  type Context,
  type Language,
} from "./migrate.ts";

const made: string[] = [];
afterAll(() => made.forEach((at) => rmSync(at, { recursive: true, force: true })));

const id = (n: number) => String(n).padStart(15, "0");

// ---- Written again, purely

const language: Language = {
  use: "U",
  function: "F",
  value: "V",
  number: "N",
  string: "S",
  boolean: "B",
  list: "L",
  record: "R",
  holon: "H",
};

// A context minting handles in turn, its natives by id, its functions by name.
function context(natives: Record<string, string> = {}, named: Record<string, string> = {}): Context {
  let made = 0;
  return {
    language,
    mint: () => `~${++made}`,
    nativeOf: (fn) => natives[fn],
    named: (name) => named[name] ?? `no ${name}`,
  };
}

const call = (fn: string, ...given: Expression[]): Expression => ({ call: { $ref: fn }, with: given });
const held = ($ref: string) => ({ $ref, $holds: true });

describe("takes as input", () => {
  test("each word a placeholder of what it takes, numbered where it comes twice", () => {
    expect(takesToInput(["list", "function"])).toEqual([
      { name: "list", takes: ["list"] },
      { name: "function", takes: ["function"] },
    ]);
    expect(takesToInput(["value", "key", "value"])?.map(({ name }) => name)).toEqual([
      "value 1",
      "key",
      "value 2",
    ]);
    expect(takesToInput(["set", "words"])?.map(({ takes }) => takes)).toEqual([
      ["list", "holon"],
      ["string", "list"],
    ]);
  });

  test("taking any number, there is no input; saying nothing, it takes nothing", () => {
    expect(takesToInput(["set", "sets"])).toBeUndefined();
    expect(takesToInput(["function", "values"])).toBeUndefined();
    expect(takesToInput(undefined)).toEqual([]);
  });
});

describe("expressions as uses", () => {
  test("a call is a use held where it is written, its lists and records JSON", () => {
    const { arg, holons } = usesOf(
      call(
        "add",
        1,
        { list: [2, call("size", { list: [] })] },
        { record: { a: { $ref: "X" }, b: { "?": "b" } } },
      ),
      context(),
    );

    expect(arg).toEqual(held("~2"));
    expect(holons).toEqual([
      { id: "~1", instance: ["U"], body: { fn: { $ref: "size" }, args: [[]] } },
      {
        id: "~2",
        instance: ["U"],
        body: { fn: { $ref: "add" }, args: [1, [2, held("~1")], { a: { $ref: "X" }, b: { "?": "b" } }] },
      },
    ]);
  });

  test("the earliest form calls a function by its name", () => {
    const { holons } = usesOf(
      { call: "measure", with: [{ call: "everything", with: [] }, "held"] } as never,
      context({}, { measure: "M", everything: "E" }),
    );

    expect(holons.map(({ body }) => body.fn)).toEqual([{ $ref: "E" }, { $ref: "M" }]);
  });

  test("a lambda is a function held where it is written, its words placeholders, an outer word its own", () => {
    const outer = {
      fn: ["y"],
      gives: call("map", { var: "y" }, { fn: ["x"], gives: call("add", { var: "x" }, { var: "y" }) }),
    };
    const { arg, holons } = usesOf(outer, context());
    const byId = new Map(holons.map((holon) => [holon.id, holon]));
    const [y] = (byId.get((arg as { $ref: string }).$ref)!.body.input as { $ref: string }[]).map(
      ({ $ref }) => $ref,
    );

    expect(byId.get(y!)).toEqual({ id: y, instance: ["V"], name: "y", body: {} });
    const inner = [...byId.values()].find(
      ({ body, id }) => body.input && id !== (arg as { $ref: string }).$ref,
    )!;
    const [x] = (inner.body.input as { $ref: string }[]).map(({ $ref }) => $ref);
    const added = byId.get((inner.body.body as { $ref: string }).$ref)!;
    expect(added.body).toEqual({ fn: { $ref: "add" }, args: [{ $ref: x }, { $ref: y }] });
  });

  test("an argument of a function of one's own is the placeholder at its place", () => {
    const { arg } = usesOf({ arg: 1 } as never, context(), {
      words: new Map(),
      args: [{ $ref: "P0" }, { $ref: "P1" }],
    });

    expect(arg).toEqual({ $ref: "P1" });
    expect(() => usesOf({ var: "z" }, context())).toThrow("z is not a word any lambda around it takes");
  });

  test("within find a lambda is a test over the pattern's variables, and not a clause of clauses", () => {
    const found = call(
      "find",
      { "?": "n" },
      { list: [{ "?": "n" }, "value", { "?": "v" }] },
      { fn: ["v"], gives: call("lt", 3, { var: "v" }) },
      call("not", { list: [{ "?": "n" }, "name", "x"] }),
    );
    const { holons } = usesOf(found, context({ find: "find", not: "not" }));
    const bodies = holons.map(({ body }) => body);

    expect(bodies).toEqual([
      { fn: { $ref: "lt" }, args: [3, { "?": "v" }] },
      { fn: { $ref: "not" }, args: [[{ "?": "n" }, "name", "x"]] },
      {
        fn: { $ref: "find" },
        args: [{ "?": "n" }, [{ "?": "n" }, "value", { "?": "v" }], held("~1"), held("~2")],
      },
    ]);
  });

  test("a function of the field: its lambda's words placeholders typed by its takes, its gives the body", () => {
    const { input, body, holons } = writtenAgain(
      {
        gives: { fn: ["h", "depth"], gives: call("get", { var: "h" }, { var: "depth" }) },
        takes: ["holon", "number"],
      },
      context(),
    );

    expect(input).toEqual([held("~1"), held("~2")]);
    expect(holons.slice(0, 2)).toEqual([
      { id: "~1", instance: ["H"], name: "h", body: {} },
      { id: "~2", instance: ["N"], name: "depth", body: {} },
    ]);
    expect(body).toEqual(held("~3"));
    expect(holons[2]!.body).toEqual({ fn: { $ref: "get" }, args: [{ $ref: "~1" }, { $ref: "~2" }] });
  });

  test("a mount is a use of its component, offering a list of refs; one naming none names no fn", () => {
    const { body, holons } = mountUse(
      {
        component: { $ref: "C" },
        gathers: call("type", { $ref: "T" }),
        offer: { a: { $ref: "A" }, b: { $ref: "B" } },
      },
      context(),
    );

    expect(body).toEqual({ fn: { $ref: "C" }, args: [held("~1")], offer: [{ $ref: "A" }, { $ref: "B" }] });
    expect(holons).toHaveLength(1);
    expect(mountUse({}, context()).body).toEqual({ args: [] });
  });
});

// ---- Migrated through the engine

// A store begun with these holons, as one act.
async function begun(holons: Holon[], root: string): Promise<Store> {
  const folder = mkdtempSync(join(tmpdir(), "glass-migrate-"));
  made.push(folder);
  const store = strata(folderStorage(folder));
  const part = partOf(holons);
  const said = {
    when: "2026-11-18T00:00:00.000Z",
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
    born: holons.map((holon) => holon.id),
    over: null,
    touches: { ids: holons.map((holon) => holon.id), addresses: [] },
  });
  if (!("accepted" in reply)) throw new Error(JSON.stringify(reply));
  return store;
}

// The language as the stores of record keep it: a function's gives an expression, its
// takes words; a mount gathering by an expression.
const takes: Record<string, string[]> = {
  add: ["number", "number"],
  map: ["list", "function"],
  size: ["list"],
  get: ["value", "key"],
  type: ["set"],
  if: ["value", "value", "value"],
  lt: ["value", "value"],
};
const nativeNames = Object.keys(takes);
const fn = (name: string) => id(10 + nativeNames.indexOf(name));
const glass: Holon[] = [
  {
    id: id(1),
    instance: [],
    name: "function",
    mould: {
      native: { says: "its native", shape: "string", optional: true },
      says: { says: "what it does", shape: "string", optional: true },
      gives: { says: "what it gives", shape: "expression", optional: true },
      takes: { says: "what it takes", shape: { list: "string" }, optional: true },
    },
    body: {},
  },
  {
    id: id(2),
    instance: [],
    name: "store",
    mould: { contents: { says: "what it holds", shape: { list: "ref" }, holds: true, optional: true } },
    body: {},
  },
  {
    id: id(3),
    instance: [],
    name: "mount",
    mould: {
      component: { says: "what draws it", shape: "ref", optional: true },
      gathers: { says: "what it draws", shape: "expression", optional: true },
    },
    body: {},
  },
  { id: id(4), instance: [], name: "note", mould: { n: { says: "its number", shape: "number" } }, body: {} },
  ...nativeNames.map((name) => ({
    id: fn(name),
    instance: [id(1)],
    name,
    body: { native: name, takes: takes[name] },
  })),
  {
    id: id(30),
    instance: [id(1)],
    name: "double",
    body: { gives: { fn: ["x"], gives: call(fn("add"), { var: "x" }, { var: "x" }) }, takes: ["number"] },
  },
  {
    id: id(31),
    instance: [id(1)],
    name: "doubled",
    body: {
      gives: {
        fn: ["notes", "above"],
        gives: call(
          fn("map"),
          { var: "notes" },
          {
            fn: ["note"],
            gives: call(
              fn("if"),
              call(fn("lt"), { var: "above" }, call(fn("get"), { var: "note" }, "n")),
              call(id(30), call(fn("get"), { var: "note" }, "n")),
              null,
            ),
          },
        ),
      },
      takes: ["list", "number"],
    },
  },
  { id: id(32), instance: [id(3)], name: "entry", body: { gathers: call(fn("type"), { $ref: id(4) }) } },
  { id: id(40), instance: [id(4)], name: "one", body: { n: 1 } },
  { id: id(41), instance: [id(4)], name: "five", body: { n: 5 } },
  {
    id: id(50),
    instance: [id(2)],
    name: "glass",
    body: {
      contents: [1, 3, 4, 30, 31, 32, 40, 41, ...nativeNames.map((_, i) => 10 + i)].map((n) => ({
        $ref: id(n),
        $holds: true,
      })),
    },
  },
];

describe("a field migrated", () => {
  test("reads as the earlier form did, keeps what it names, and is written once", async () => {
    const store = await begun(glass, id(50));
    const next = await engine({ workers: sameThread(), count: 2 });
    await next.mount("glass", store, { write: true });

    const { language, commits } = await migrate(next, new Map([["glass", store]]));
    expect(commits.map(({ store }) => store)).toEqual(["glass", "glass"]);

    // An expression of the earlier form, read as uses.
    const asking = (expression: Expression) => {
      let made = 0;
      const { arg, holons } = usesOf(expression, {
        language,
        mint: () => `~${++made}`,
        nativeOf: (id) => nativeNames.find((name) => fn(name) === id),
        named: () => "",
      });
      return next.read({ gives: arg, holons });
    };

    // doubled(type(@note), 2): the notes above 2, doubled, as the earlier engine gave.
    expect(await asking(call(id(31), call(fn("type"), { $ref: id(4) }), 2))).toMatchObject({
      value: [null, 10],
    });
    expect(await asking(call(fn("get"), { $ref: id(31) }, "gives"))).toMatchObject({ value: null });
    // parse and print shipped as a pair, each naming the other its reverse; print(parse(t)) is t.
    const { at } = await asking(call(fn("get"), { $ref: id(50) }, "name"));
    const named = async (name: string) => {
      const facts = await store.read(at.glass!, { facts: { a: "name", v: name } });
      return JSON.parse(new TextDecoder().decode(facts as Uint8Array)).e as string;
    };
    const [parse, print] = [await named("parse"), await named("print")];
    expect(await asking(call(fn("get"), { $ref: parse }, "reverse"))).toMatchObject({
      value: { $ref: print },
    });
    expect(await asking(call(fn("get"), { $ref: print }, "reverse"))).toMatchObject({
      value: { $ref: parse },
    });
    expect(await asking(call(print, call(parse, "size([1, 2])")))).toMatchObject({ value: "size([1, 2])" });

    // The mount is a use now, naming no component, so it is drawn for one to be found.
    expect(await next.read({ gives: { $ref: id(32) } })).toMatchObject({
      value: { $draw: null, given: [[{ $ref: id(40) }, { $ref: id(41) }]], at: [id(32)] },
    });

    expect((await migrate(next, new Map([["glass", store]]))).commits).toEqual([]);
  });
});
