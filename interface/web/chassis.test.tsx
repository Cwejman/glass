// The chassis in a page of its own: drawings found by their component's id and kept in
// place as answers come, over an engine whose answers the test gives; then the page's
// own reads, answer(parse(text)) and the text typed into a buffer beside its answer,
// drawn over a real engine and a store, each value by the component found for it by type.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { h } from "../../components/jsx.ts";
import { engine, type Answer, type Engine, type Read } from "../../engine/next/engine.ts";
import type { Value } from "../../engine/next/read/values.ts";
import { sameThread } from "../../runtime/runtime.ts";
import { contentOf, hashOf, partOf } from "../../stores/act.ts";
import type { Act, Holon, Store } from "../../stores/store.ts";
import { folderStorage } from "../../stores/strata/storage/folder.ts";
import { strata } from "../../stores/strata/strata.ts";
import { answer } from "./answer.tsx";
import { buffer } from "../../stores/buffer/buffer.ts";
import { begun, typed } from "../../stores/buffer/string.ts";
import { addressed } from "./address.ts";
import {
  answer as answerId,
  answerOf,
  applying,
  expressionInput as expressionInputId,
  readerOf,
} from "./carried.ts";
import { draw, type Drawer, type Realization } from "./chassis.ts";
import { expressionInput } from "./expression-input.tsx";
import { finder } from "./find.ts";
import { list } from "./list.tsx";
import { value } from "./value.tsx";

beforeAll(() => {
  if (!globalThis.document) GlobalRegistrator.register({ url: "https://glass.test/next/" });
});

const made: string[] = [];
afterAll(() => made.forEach((at) => rmSync(at, { recursive: true, force: true })));

const settled = async (test: () => unknown, within = 4000) => {
  for (const start = performance.now(); !test(); await Bun.sleep(10))
    if (performance.now() - start > within) throw new Error("it did not settle");
};

const id = (n: number) => String(n).padStart(15, "0");
const [valueId, listId, countId] = [id(30), id(31), id(32)];

// A component realized for the test: a number in bold, counting what it makes and lets go.
function counting() {
  const seen = { made: 0, gone: 0 };
  const count: Realization = (given) => {
    seen.made++;
    const node = (<b class="count">{String(given[0])}</b>) as HTMLElement;
    return {
      node,
      update: ([n]) => void (node.textContent = String(n)),
      dispose: () => void seen.gone++,
    };
  };
  return { count, seen };
}

describe("drawing what an engine gives", () => {
  // An engine whose one subscription answers what the test gives it.
  function given() {
    let listener: ((answer: Answer) => void) | undefined;
    const engine: Drawer["engine"] = {
      read: async () => ({ at: {}, value: null }),
      subscribe: async (_read, heard) => ((listener = heard), () => void (listener = undefined)),
      commit: async () => ({ refused: [] }),
    };
    return { engine, answer: (value: Value) => listener?.({ at: {}, value }) };
  }

  const counted = (n: number, at: string) => ({ $draw: { $ref: countId }, given: [n], at: [at] });

  test("each drawing is drawn by the component it names, and kept in place as answers come", async () => {
    const { engine, answer: giving } = given();
    const { count, seen } = counting();
    const realized = new Map([
      [valueId, value],
      [listId, list],
      [countId, count],
    ]);
    const page = document.createElement("main");
    const find = (found: Value) => (Array.isArray(found) ? listId : valueId);
    const stop = await draw(page, { gives: null }, { engine, realized, find });

    giving([counted(1, "a"), counted(2, "b")]);
    const drawn = [...page.querySelectorAll(".count")];
    expect(drawn.map((each) => each.textContent)).toEqual(["1", "2"]);

    giving([counted(5, "a"), counted(2, "b")]);
    expect([...page.querySelectorAll(".count")]).toEqual(drawn);
    expect(drawn[0]!.textContent).toBe("5");
    expect(seen).toEqual({ made: 2, gone: 0 });

    giving([counted(5, "a")]);
    expect([...page.querySelectorAll(".count")]).toEqual([drawn[0]!]);
    expect(seen).toEqual({ made: 2, gone: 1 });

    // The same component reached by another way is another drawing.
    giving([counted(5, "c")]);
    expect(seen).toEqual({ made: 3, gone: 2 });

    stop();
    expect(seen.gone).toBe(3);
  });

  test("a use naming no component, or one not realized here, is drawn by the one found for it", async () => {
    const { engine, answer: giving } = given();
    const realized = new Map([[valueId, value]]);
    const page = document.createElement("main");
    await draw(page, { gives: null }, { engine, realized, find: () => valueId });

    giving({ $draw: null, given: ["found by type"], at: ["a"] });
    expect(page.textContent).toBe("found by type");

    giving({ $draw: { $ref: "elsewhere" }, given: [42], at: ["b"] });
    expect(page.textContent).toBe("42");
  });
});

describe("the page's read over a real engine", () => {
  // The language, a component of numbers, and two notes, the first referring to the second.
  const language: Holon[] = [
    {
      id: id(1),
      instance: [],
      name: "function",
      mould: { input: { says: "", shape: { list: "ref" }, holds: true, optional: true } },
      body: {},
    },
    {
      id: id(2),
      instance: [],
      name: "use",
      mould: { fn: { says: "", shape: "ref", optional: true }, args: { says: "", shape: "json" } },
      body: {},
    },
    {
      id: id(3),
      instance: [],
      name: "component",
      mould: { input: { says: "", shape: { list: "ref" }, holds: true, optional: true } },
      body: {},
    },
    { id: id(4), instance: [], name: "value", mould: {}, body: {} },
    { id: id(5), instance: [], name: "number", mould: {}, body: {} },
    { id: valueId, instance: [id(3)], name: "Value", body: {} },
    { id: countId, instance: [id(3)], name: "Count", body: { input: [{ $ref: id(33), $holds: true }] } },
    { id: id(33), instance: [id(5)], name: "n", body: {} },
    { id: listId, instance: [id(3)], name: "List", body: { input: [{ $ref: id(34), $holds: true }] } },
    { id: id(34), instance: [id(8)], name: "items", body: {} },
    { id: id(8), instance: [], name: "list", mould: {}, body: {} },
    { id: id(40), instance: [], name: "First", body: { text: "Glass holds holons", see: { $ref: id(41) } } },
    { id: id(41), instance: [], name: "Second", body: {} },
    {
      id: id(6),
      instance: [],
      name: "store",
      mould: {
        shape: { says: "", shape: "ref" },
        contents: { says: "", shape: { set: "ref" }, holds: true },
      },
      body: {},
    },
    {
      id: id(7),
      instance: [],
      name: "shape",
      mould: { admits: { says: "", shape: { set: "ref" }, optional: true } },
      body: {},
    },
  ];

  // An engine on one thread over a store holding these holons, taken as one act.
  async function engineOver(holons: Holon[]): Promise<Engine> {
    const folder = mkdtempSync(join(tmpdir(), "glass-chassis-"));
    made.push(folder);
    const store: Store = strata(folderStorage(folder));

    const part = partOf(holons);
    const said = {
      when: "2026-11-18T00:00:00.000Z",
      at: [] as Act["at"],
      says: "a test",
      gone: [],
      parts: [["field", part && (await hashOf(part))]] as Act["parts"],
    };
    await store.offer({
      ...said,
      hash: await hashOf(contentOf(said)),
      own: "field",
      holons,
      born: holons.map((holon) => holon.id),
      over: null,
      touches: { ids: holons.map((holon) => holon.id), addresses: [] },
    });

    const started = await engine({ workers: sameThread() });
    await started.mount("field", store);
    return started;
  }

  test("answer, given a text read into uses, draws the holon it names as its values, each reference a link", async () => {
    const field = await engineOver(language);
    const realized = new Map<string, Realization>([
      [valueId, value],
      [answerId, answer],
    ]);
    const find = finder((read: Read) => field.read(read), [...realized.keys()], valueId);
    const page = document.createElement("main");
    const stop = await draw(page, answerOf("@First"), { engine: field, realized, find });

    await settled(() => page.querySelector("a[data-ref]")?.textContent === "Second");
    expect(page.querySelector("h1")!.textContent).toBe("First");
    expect(page.querySelector(".words")!.textContent).toBe("Glass holds holons");
    expect(page.querySelector("a[data-ref]")!.getAttribute("href")).toBe(`?q=@${id(41)}`);
    stop();
  });

  test("a value is found the component whose first placeholder takes it, else the fallback", async () => {
    const field = await engineOver(language);
    const find = finder((read: Read) => field.read(read), [valueId, countId], valueId);

    expect(await find(3)).toBe(countId);
    expect(await find("three")).toBe(valueId);
    expect(await find({ $ref: id(40) })).toBe(valueId);
  });

  test("a text that does not read is said in place of what it gives", async () => {
    const field = await engineOver(language);
    const realized = new Map<string, Realization>([
      [valueId, value],
      [answerId, answer],
    ]);
    const find = finder((read: Read) => field.read(read), [...realized.keys()], valueId);
    const page = document.createElement("main");
    await draw(page, answerOf("add(1,"), { engine: field, realized, find });

    await settled(() => page.querySelector(".note"));
    expect(page.querySelector(".note")!.textContent).toContain("an expression begins here");
  });

  // The engine over the language, with a query buffer mounted to write, begun, holding the
  // text given; and the page's read drawn over it.
  async function typing(text: string) {
    const field = await engineOver(language);
    await field.mount("query", buffer(), { write: true });
    const begin = await field.commit(begun("query", { store: id(6), shape: id(7) }));
    if (!("ids" in begin)) throw new Error(JSON.stringify(begin));
    const holon = begin.ids["~2"]!;
    await field.commit(typed(holon, text));

    const realized = new Map<string, Realization>([
      [valueId, value],
      [answerId, answer],
      [expressionInputId, expressionInput],
      [listId, list],
    ]);
    const find = finder((read: Read) => field.read(read), [...realized.keys()], valueId);
    const page = document.createElement("main");
    document.body.append(page);
    const stop = await draw(page, readerOf(holon, listId), { engine: field, realized, find });

    const held = async () => {
      const answer = await field.read(applying("get", { $ref: holon }, "text"));
      return "value" in answer ? answer.value : answer.problem;
    };
    return { field, holon, page, stop, held };
  }

  test("typing goes back to the buffer, and the answer follows, the input kept in place", async () => {
    const { page, stop, held } = await typing("@First");
    await settled(() => page.querySelector("h1")?.textContent === "First");

    const input = page.querySelector<HTMLInputElement>(".expression-input input")!;
    expect(input.value).toBe("@First");
    input.focus();
    for (const typed of ["@Sec", "@Second"]) {
      input.value = typed;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await settled(() => page.querySelector("h1")?.textContent === "Second");
    expect(await held()).toBe("@Second");
    expect(page.querySelector(".expression-input input")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("@Second");
    expect(input.readOnly).toBe(false);
    stop();
  });

  test("the address types into the buffer, and following a link in the page is a step of its own", async () => {
    history.replaceState(null, "", "/next/?q=@First");
    const { field, holon, page, stop, held } = await typing("");
    const unaddressed = await addressed(field, holon, page);

    expect(await held()).toBe("@First");
    await settled(() => page.querySelector("a[data-ref]")?.textContent === "Second");
    const steps = history.length;

    const link = page.querySelector<HTMLAnchorElement>("a[data-ref]")!;
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    await settled(() => page.querySelector("h1")?.textContent === "Second");
    expect(location.search).toBe(`?q=@${id(41)}`);
    expect(history.length).toBe(steps + 1);
    expect(await held()).toBe(`@${id(41)}`);

    unaddressed();
    stop();
  });
});
