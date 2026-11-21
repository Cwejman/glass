// The way back: a value proposed where a drawing stands, walked back to a change, over a
// store holding the language and a holon of text, and uses the read carries.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentOf, hashOf, partOf } from "../../stores/act.ts";
import type { Act, Holon } from "../../stores/store.ts";
import { folderStorages } from "../../stores/strata/storage/folder.ts";
import { strata } from "../../stores/strata/strata.ts";
import { evaluate } from "./evaluate.ts";
import type { Value } from "./values.ts";

const made: string[] = [];
afterAll(() => made.forEach((at) => rmSync(at, { recursive: true, force: true })));

const id = (n: number) => String(n).padStart(15, "0");
const declared = { says: "", shape: "json", optional: true };

const natives = ["back", "get", "add", "parse", "print", "each", "steps", "chain", "quote"];
const fn = (name: string) => ({ $ref: id(10 + natives.indexOf(name)) });
const text = id(100);

const language: Holon[] = [
  { id: id(1), instance: [], name: "function", mould: { input: declared }, body: {} },
  { id: id(2), instance: [], name: "use", mould: { fn: declared, args: declared }, body: {} },
  { id: id(3), instance: [], name: "component", mould: { input: declared }, body: {} },
  ...natives.map((name) => ({ id: fn(name).$ref, instance: [id(1)], name, body: { native: name } })),
  { id: text, instance: [], name: "text", body: { text: "[3]", kept: true, texts: ["[1]", "[2]"] } },
];

// Parse and print as a pair, each naming the other its reverse.
language.find(({ name }) => name === "parse")!.body.reverse = fn("print");
language.find(({ name }) => name === "print")!.body.reverse = fn("parse");
language.find(({ name }) => name === "steps")!.body.reverse = fn("chain");
language.find(({ name }) => name === "chain")!.body.reverse = fn("steps");

async function field() {
  const folder = mkdtempSync(join(tmpdir(), "glass-back-"));
  made.push(folder);
  const store = strata(folderStorages(folder));

  const part = partOf(language);
  const said = {
    when: "2026-11-18T00:00:00.000Z",
    at: [] as Act["at"],
    says: "a test",
    gone: [],
    parts: [["glass", part && (await hashOf(part))]] as Act["parts"],
  };
  const reply = await store.offer({
    ...said,
    hash: await hashOf(contentOf(said)),
    own: "glass",
    holons: language,
    born: language.map((holon) => holon.id),
    over: null,
    touches: { ids: language.map((holon) => holon.id), addresses: [] },
  });
  if (!("accepted" in reply)) throw new Error(JSON.stringify(reply));

  const stores = new Map([["glass", { store }]]);
  return (gives: unknown, holons: Holon[]) =>
    evaluate({ gives, holons }, stores, { glass: reply.accepted }) as Promise<{
      value?: Value;
      problem?: string;
    }>;
}

// Uses and components a read carries, each under a handle named as given.
function carried() {
  const holons: Holon[] = [];
  const use = (handle: string, applying: { $ref: string }, ...args: unknown[]) => {
    holons.push({ id: handle, instance: [id(2)], body: { fn: applying, args } });
    return { $ref: handle, $holds: true };
  };
  const component = (handle: string, input: string[] = [], body?: unknown) => {
    for (const each of input) holons.push({ id: each, instance: [], body: {} });
    holons.push({
      id: handle,
      instance: [id(3)],
      body: { input: input.map(($ref) => ({ $ref, $holds: true })), ...(body !== undefined && { body }) },
    });
    return { $ref: handle };
  };
  return { holons, use, component };
}

// The read asking the way back from a place: what it gives, and the uses it carries, the
// value quoted, so the references within it stay its own.
const proposed = (at: string[], place: number, value: Value) => ({
  gives: { $ref: "~back", $holds: true },
  holons: [
    {
      id: "~back",
      instance: [id(2)],
      body: { fn: fn("back"), args: [at, place, { $ref: "~value", $holds: true }] },
    },
    { id: "~value", instance: [id(2)], body: { fn: fn("quote"), args: [value] } },
  ] as Holon[],
});

describe("the way back", () => {
  test("from a use of get, a change setting that key of the holon, the rest kept", async () => {
    const read = await field();
    const { holons, use, component } = carried();
    use("~input", component("~view", ["~shown"]), use("~text", fn("get"), { $ref: text }, "text"));
    const asked = proposed(["~input"], 0, "[4]");

    expect((await read(asked.gives, [...holons, ...asked.holons])).value).toEqual({
      holons: [
        { id: text, instance: [], name: "text", body: { text: "[4]", kept: true, texts: ["[1]", "[2]"] } },
      ],
      says: "text of text set",
      at: {},
    });
  });

  test("through a placeholder, to the use one step out", async () => {
    const read = await field();
    const { holons, use, component } = carried();
    const view = component("~view", ["~shown"]);
    const framing = component("~framing", ["~framed"], use("~inner", view, { $ref: "~framed" }));
    use("~root", framing, use("~text", fn("get"), { $ref: text }, "text"));
    const asked = proposed(["~root", "~inner"], 0, "typed");

    const { value } = await read(asked.gives, [...holons, ...asked.holons]);
    expect((value as { holons: Holon[] }).holons[0]!.body.text).toBe("typed");
  });

  test("through a function naming its reverse, the value given the reverse", async () => {
    const read = await field();
    const parsed = (
      await read({ $ref: "~p", $holds: true }, [
        { id: "~p", instance: [id(2)], body: { fn: fn("parse"), args: ["[1, 2]"] } },
      ])
    ).value;

    const { holons, use, component } = carried();
    const view = component("~view", ["~shown"]);
    use("~input", view, use("~parsed", fn("parse"), use("~text", fn("get"), { $ref: text }, "text")));
    const asked = proposed(["~input"], 0, parsed!);

    const { value } = await read(asked.gives, [...holons, ...asked.holons]);
    expect((value as { holons: Holon[] }).holons[0]!.body.text).toBe("[1, 2]");
  });

  test("anything else has no way back", async () => {
    const read = await field();
    const { holons, use, component } = carried();
    const view = component("~view", ["~shown"]);
    use("~written", view, "fixed");
    use("~added", view, use("~sum", fn("add"), 1, 2));
    use("~kept", view, use("~own", fn("get"), { $ref: text }, "name"));
    use("~loose", view, { $ref: "~shown" });

    for (const at of [["~written"], ["~added"], ["~kept"], ["~loose"], [id(999)]]) {
      const asked = proposed(at, 0, "x");
      expect((await read(asked.gives, [...holons, ...asked.holons])).value).toBeNull();
    }
  });

  test("past an optional placeholder, what is taken depends on what fits, so there is no way back", async () => {
    const read = await field();
    const { holons, use } = carried();
    holons.push(
      { id: "~maybe", instance: [], body: {} },
      { id: "~shown", instance: [], body: {} },
      {
        id: "~view",
        instance: [id(3)],
        body: {
          input: [
            { $ref: "~maybe", $holds: true, $optional: true },
            { $ref: "~shown", $holds: true },
          ],
        },
      },
    );
    use("~input", { $ref: "~view" }, use("~text", fn("get"), { $ref: text }, "text"));
    const asked = proposed(["~input"], 0, "x");

    expect((await read(asked.gives, [...holons, ...asked.holons])).value).toBeNull();
  });

  test("through each, a drawing of the component given back what it was given first", async () => {
    const read = await field();
    const { holons, use, component } = carried();
    const pill = component("~pill", ["~step"]);
    const listed = component("~list", ["~items"]);
    const typed = use("~text", fn("get"), { $ref: text }, "text");
    use(
      "~pills",
      listed,
      use("~each", fn("each"), use("~steps", fn("steps"), use("~parsed", fn("parse"), typed)), pill),
    );
    const drawn = (step: Value) => ({ $draw: pill, given: [step], at: [] });

    const steps = (
      await read({ $ref: "~s", $holds: true }, [
        { id: "~s", instance: [id(2)], body: { fn: fn("steps"), args: [{ $ref: "~p", $holds: true }] } },
        { id: "~p", instance: [id(2)], body: { fn: fn("parse"), args: ["1 | add(2) | add(3)"] } },
      ])
    ).value as Value[];
    expect(steps).toHaveLength(3);

    // The second step taken out: the chain closes over it.
    const asked = proposed(["~pills"], 0, [drawn(steps[0]!), drawn(steps[2]!)]);
    const { value } = await read(asked.gives, [...holons, ...asked.holons]);
    expect((value as { holons: Holon[] }).holons[0]!.body.text).toBe("add(1, 3)");

    // An item drawn by another component has no way back.
    const stranger = proposed(["~pills"], 0, [{ $draw: { $ref: "~list" }, given: [steps[0]!], at: [] }]);
    expect((await read(stranger.gives, [...holons, ...stranger.holons])).value).toBeNull();
  });

  test("through each of a function naming its reverse, each item given the reverse", async () => {
    const read = await field();
    const { holons, use, component } = carried();
    const view = component("~view", ["~shown"]);
    use(
      "~input",
      view,
      use("~each", fn("each"), use("~texts", fn("get"), { $ref: text }, "texts"), fn("parse")),
    );
    const parsed = (
      await read({ $ref: "~p", $holds: true }, [
        { id: "~p", instance: [id(2)], body: { fn: fn("parse"), args: ["[5]"] } },
      ])
    ).value!;

    const asked = proposed(["~input"], 0, [parsed]);
    const { value } = await read(asked.gives, [...holons, ...asked.holons]);
    expect((value as { holons: Holon[] }).holons[0]!.body.texts).toEqual(["[5]"]);
  });
});
