// The chassis in a page of its own: drawings found by their component's id and kept in
// place as answers come, over an engine whose answers the test gives; then the page's
// own reads over glass with the interface shipped: Answer, given a text read into uses,
// and Reader, the text typed into a buffer, its steps as pills, beside its answer, each
// value by the component found for it by type.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { h } from "../../components/jsx.ts";
import type { Answer, Engine, Read } from "../../engine/next/engine.ts";
import { cleanUp, id, notes, shipped } from "../../engine/next/uses/fixture.ts";
import type { Value } from "../../engine/next/read/values.ts";
import { buffer } from "../../stores/buffer/buffer.ts";
import { begun, typed } from "../../stores/buffer/string.ts";
import { addressed } from "./address.ts";
import { applying, found, type Glass } from "./carried.ts";
import { draw, type Drawer, type Realization } from "./chassis.ts";
import { finder } from "./find.ts";
import { list } from "./list.tsx";
import { realizations, realizedIn } from "./realized.ts";
import { value } from "./value.tsx";

beforeAll(() => {
  if (!globalThis.document) GlobalRegistrator.register({ url: "https://glass.test/next/" });
});

afterAll(cleanUp);

const settled = async (test: () => unknown, within = 4000) => {
  for (const start = performance.now(); !(await test()); await Bun.sleep(10))
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
    const find = (found: Value) => ({
      component: Array.isArray(found) ? listId : valueId,
      by: "fallback" as const,
    });
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
    await draw(
      page,
      { gives: null },
      { engine, glass, realized, find: () => ({ component: valueId, by: "fallback" }) },
    );

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
    const find = finder((read: Read) => engine.read(read), glass, [...realized.keys()]);
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

  test("a value is found the component whose first placeholder takes its type; a kind alone finds none", async () => {
    const { glass, find } = await page();
    for (const given of [3, "three", [1, 2], { gives: 1 }, { $ref: notes.first }])
      expect(await find(given as Value)).toEqual({ component: glass.Value, by: "fallback" });
    expect(await find({ $ref: notes.brief })).toEqual({ component: glass.Brief, by: "type" });
  });

  test("each realization names a component without a body, and each such component has a realization", async () => {
    const { engine, glass } = await page();
    const answer = await engine.read(applying(glass, "parse", "@glass:components"));
    if (!("value" in answer)) throw new Error(answer.problem);
    const components = await engine.read(answer.value as unknown as Read);
    const held = "value" in components ? await engine.read(applying(glass, "holon", components.value)) : null;
    const ids = ((held && "value" in held ? (held.value as any).body.holds : []) as { $ref: string }[]).map(
      ({ $ref }) => $ref,
    );
    const bodiless = [];
    for (const id of ids) {
      const read = await engine.read(applying(glass, "holon", { $ref: id }));
      const holon = "value" in read ? (read.value as any) : null;
      if (holon && holon.body.body === undefined) bodiless.push(holon.name as string);
    }
    expect(bodiless.length).toBeGreaterThan(0);
    expect(bodiless.sort()).toEqual(Object.keys(realizations).sort());
    for (const name of Object.keys(realizations))
      expect(ids).toContain(glass[name as keyof typeof realizations]);
  });

  test("a brief is read as its name, its flow, a brief in its flow as a link, and its sections", async () => {
    const { into, drawing } = await page();
    const stop = await drawing(`@${notes.brief}`);

    await settled(() => into.querySelector(".brief h2")?.textContent === "Part");
    expect(into.querySelector(".brief h1")!.textContent).toBe("Notes");
    expect([...into.querySelectorAll(".brief p")].map((p) => p.textContent)).toEqual([
      "Notes hold.",
      "Inner",
      "Within",
    ]);
    expect(into.querySelector(".brief .face a")!.getAttribute("href")).toBe(`?q=@${notes.inner}`);
    expect(into.querySelector(".brief h2 a")!.getAttribute("href")).toBe(`?q=@${notes.part}`);
    stop();
  });

  // What a use is kept as now: what it applies, if anything.
  async function fnOf(engine: Engine, glass: Glass, use: string) {
    const answer = await engine.read(applying(glass, "holon", { $ref: use }));
    return "value" in answer ? ((answer.value as any).body.fn?.$ref as string | undefined) : answer.problem;
  }

  test("the component found by type for a use that names none is written into it", async () => {
    const { engine, glass, into } = await page();
    const realized = realizedIn(glass);
    const find = finder((read: Read) => engine.read(read), glass, [...realized.keys()]);
    const stop = await draw(
      into,
      { gives: { $ref: notes.unnamed, $holds: true } },
      { engine, glass, realized, find },
    );

    await settled(() => into.querySelector(".brief h1")?.textContent === "Notes");
    await settled(async () => (await fnOf(engine, glass, notes.unnamed)) === glass.Brief);
    stop();
  });

  test("where several components could draw it, the person chooses, and the pick is written", async () => {
    const { engine, glass, into } = await page();
    const made = await engine.commit({
      holons: [
        {
          id: "~1",
          instance: [id(3)],
          name: "Outline",
          body: { says: "A brief's headings.", input: [{ $ref: "~2", $holds: true }] },
        },
        { id: "~2", instance: [id(6)], name: "brief", body: {} },
      ],
      says: "a second way to draw a brief",
      into: "glass",
      at: {},
    });
    if (!("ids" in made)) throw new Error(JSON.stringify(made));
    const outline = made.ids["~1"]!;
    const realized = new Map([...realizedIn(glass), [outline, counting().count]]);
    const find = finder((read: Read) => engine.read(read), glass, [...realized.keys()]);
    const stop = await draw(
      into,
      { gives: { $ref: notes.unnamed, $holds: true } },
      { engine, glass, realized, find },
    );

    await settled(() => into.querySelectorAll(".choose button").length === 2);
    expect([...into.querySelectorAll(".choose button")].map((b) => b.textContent).sort()).toEqual([
      "Brief",
      "Outline",
    ]);
    expect(await fnOf(engine, glass, notes.unnamed)).toBeUndefined();

    [...into.querySelectorAll<HTMLButtonElement>(".choose button")]
      .find((b) => b.textContent === "Outline")!
      .click();
    await settled(() => into.querySelector(".count") && !into.querySelector(".choose"));
    await settled(async () => (await fnOf(engine, glass, notes.unnamed)) === outline);
    stop();
  });

  test("a use the read carries is found its component each time, and nothing is written", async () => {
    const { engine, glass, into } = await page();
    const read: Read = {
      gives: { $ref: "~unnamed", $holds: true },
      holons: [{ id: "~unnamed", instance: [glass.use], body: { args: [{ $ref: notes.brief }] } }],
    };
    let commits = 0;
    const counted = {
      ...engine,
      commit: (change: Parameters<Engine["commit"]>[0]) => (commits++, engine.commit(change)),
    };
    const realized = realizedIn(glass);
    const find = finder((read: Read) => engine.read(read), glass, [...realized.keys()]);
    const stop = await draw(into, read, { engine: counted, glass, realized, find });

    await settled(() => into.querySelector(".brief h1")?.textContent === "Notes");
    expect(commits).toBe(0);
    stop();
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
    await settled(() => into.querySelector(".answer")!.textContent === "6");
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

  test("× says the holons left by their names, and the last one taken out leaves the text blank", async () => {
    history.replaceState(null, "", `/next/?q=@First | get("see")`);
    const { engine, glass, holon, into, stop, held, pills } = await reading("");
    const unaddressed = await addressed(engine, glass, holon, into);

    await settled(() => pills().length === 2 && pills().every(Boolean));
    expect(pills()).toEqual(["@First", 'get("see")']);

    into.querySelectorAll<HTMLButtonElement>(".pill button")[1]!.click();
    await settled(() => pills().length === 1);
    expect(await held()).toBe("@First");
    await settled(() => decodeURIComponent(location.search) === "?q=@First");

    into.querySelector<HTMLButtonElement>(".pill button")!.click();
    await settled(() => pills().length === 0);
    expect(await held()).toBe("");
    expect(into.querySelector(".note")).toBeNull();
    await settled(() => location.search === "");

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
