// The chassis in a page of its own: drawings found by their component's id and kept in
// place as answers come, over an engine whose answers the test gives; then the page's
// own reads over glass with the interface shipped: Answer, given a text read into uses,
// and Reader, the text typed into a buffer, its steps as pills, beside its answer, each
// value by the component found for it by type.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { h } from "../../components/jsx.ts";
import type { Answer, Engine, Read } from "../../engine/next/engine.ts";
import { cleanUp, notes, shipped } from "../../engine/next/uses/fixture.ts";
import type { Value } from "../../engine/next/read/values.ts";
import { buffer } from "../../stores/buffer/buffer.ts";
import { begun, typed } from "../../stores/buffer/string.ts";
import { addressed } from "./address.ts";
import { applying, found, type Glass } from "./carried.ts";
import { draw, type Drawer, type Realization } from "./chassis.ts";
import { finder } from "./find.ts";
import { list } from "./list.tsx";
import { realizedIn } from "./realized.ts";
import { value } from "./value.tsx";

beforeAll(() => {
  if (!globalThis.document) GlobalRegistrator.register({ url: "https://glass.test/next/" });
});

afterAll(cleanUp);

const settled = async (test: () => unknown, within = 4000) => {
  for (const start = performance.now(); !test(); await Bun.sleep(10))
    if (performance.now() - start > within) throw new Error("it did not settle");
};

const [valueId, listId, countId] = ["value", "list", "count"];

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
  // Nothing here asks glass for what it ships.
  const glass = {} as Glass;

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
    const stop = await draw(page, { gives: null }, { engine, glass, realized, find });

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
    await draw(page, { gives: null }, { engine, glass, realized, find: () => valueId });

    giving({ $draw: null, given: ["found by type"], at: ["a"] });
    expect(page.textContent).toBe("found by type");

    giving({ $draw: { $ref: "elsewhere" }, given: [42], at: ["b"] });
    expect(page.textContent).toBe("42");
  });
});

describe("the page's read over glass, the interface shipped", () => {
  // An engine over glass, what glass ships found by its routes, and the page's way of
  // drawing a read over them.
  async function page() {
    const { engine } = await shipped();
    const glass = await found((read) => engine.read(read));
    const realized = realizedIn(glass);
    const find = finder((read: Read) => engine.read(read), glass, [...realized.keys()], glass.Value);
    const parsed = async (text: string) => {
      const answer = await engine.read(applying(glass, "parse", text));
      if (!("value" in answer)) throw new Error(answer.problem);
      return answer.value as unknown as Read;
    };
    const into = document.createElement("main");
    document.body.replaceChildren(into);
    const drawing = async (text: string) => draw(into, await parsed(text), { engine, glass, realized, find });
    return { engine, glass, find, into, drawing };
  }

  test("Answer, given a text read into uses, draws the holon it names as its values, each reference a link", async () => {
    const { into, drawing } = await page();
    const stop = await drawing('Answer(parse("@First"))');

    await settled(() => into.querySelector("a[data-ref]")?.textContent === "Second");
    expect(into.querySelector("h1")!.textContent).toBe("First");
    expect(into.querySelector(".words")!.textContent).toBe("Glass holds holons");
    expect(into.querySelector("a[data-ref]")!.getAttribute("href")).toBe(`?q=@${notes.second}`);
    stop();
  });

  test("a value is found the component whose first placeholder takes it, but one drawn only where named", async () => {
    const { glass, find } = await page();
    for (const given of [3, "three", [1, 2], { gives: 1 }, { $ref: notes.first }])
      expect(await find(given as Value)).toBe(glass.Value);
  });

  test("a text that does not read is said in place of what it gives", async () => {
    const { into, drawing } = await page();
    await drawing('Answer(parse("add(1,"))');

    await settled(() => into.querySelector(".note"));
    expect(into.querySelector(".note")!.textContent).toContain("an expression begins here");
  });

  // The page: a query buffer, begun, holding the text given, and Reader drawn over it.
  async function reading(text: string) {
    const { engine, glass, into, drawing } = await page();
    await engine.mount("query", buffer(), { write: true });
    const begin = await engine.commit(begun("query", glass));
    if (!("ids" in begin)) throw new Error(JSON.stringify(begin));
    const holon = begin.ids["~2"]!;
    await engine.commit(typed(holon, text));

    const stop = await drawing('Reader(get(@query:text, "text"))');
    const held = async () => {
      const answer = await engine.read(applying(glass, "get", { $ref: holon }, "text"));
      return "value" in answer ? answer.value : answer.problem;
    };
    const pills = () => [...into.querySelectorAll(".pill .said")].map((said) => said.textContent);
    return { engine, glass, holon, into, stop, held, pills };
  }

  test("typing goes back to the buffer, and the answer follows, the input kept in place", async () => {
    const { into, stop, held } = await reading("@First");
    await settled(() => into.querySelector("h1")?.textContent === "First");

    const input = into.querySelector<HTMLInputElement>(".expression-input input")!;
    expect(input.value).toBe("@First");
    input.focus();
    for (const typed of ["@Sec", "@Second"]) {
      input.value = typed;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await settled(() => into.querySelector("h1")?.textContent === "Second");
    expect(await held()).toBe("@Second");
    expect(into.querySelector(".expression-input input")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("@Second");
    expect(input.readOnly).toBe(false);
    stop();
  });

  test("a text's steps are drawn as pills; × takes one out, the text and the address following", async () => {
    history.replaceState(null, "", "/next/?q=1 | add(2) | add(3)");
    const { engine, glass, holon, into, stop, held, pills } = await reading("");
    const unaddressed = await addressed(engine, glass, holon, into);

    await settled(() => pills().length === 3 && pills().every(Boolean));
    expect(pills()).toEqual(["1", "add(2)", "add(3)"]);
    expect(into.querySelector(".answer")!.textContent).toBe("6");
    const steps = history.length;

    into.querySelectorAll<HTMLButtonElement>(".pill button")[1]!.click();
    await settled(() => pills().length === 2 && into.querySelector(".answer")!.textContent === "4");
    expect(await held()).toBe("add(1, 3)");
    expect(pills()).toEqual(["1", "add(3)"]);
    expect(into.querySelector<HTMLInputElement>(".expression-input input")!.value).toBe("add(1, 3)");
    await settled(() => history.length === steps + 1);
    expect(decodeURIComponent(location.search)).toBe("?q=add(1, 3)");

    unaddressed();
    stop();
  });

  test("the address types into the buffer, and following a link in the page is a step of its own", async () => {
    history.replaceState(null, "", "/next/?q=@First");
    const { engine, glass, holon, into, stop, held } = await reading("");
    const unaddressed = await addressed(engine, glass, holon, into);

    expect(await held()).toBe("@First");
    await settled(() => into.querySelector("a[data-ref]")?.textContent === "Second");
    const steps = history.length;

    const link = into.querySelector<HTMLAnchorElement>("a[data-ref]")!;
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    await settled(() => into.querySelector("h1")?.textContent === "Second");
    expect(location.search).toBe(`?q=@${notes.second}`);
    expect(history.length).toBe(steps + 1);
    expect(await held()).toBe(`@${notes.second}`);

    unaddressed();
    stop();
  });
});
