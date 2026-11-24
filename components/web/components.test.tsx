// The components on the web, drawn by the chassis over glass with the interface shipped:
// Answer, given a text read into uses, and Reader, the text typed into a buffer, its steps
// as pills, beside its answer, each value by the component found for it by type.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { h } from "./jsx.ts";
import type { Answer, Engine, Read } from "../../engine/engine.ts";
import { cleanUp, id, notes, shipped } from "../../engine/uses/fixture.ts";
import type { Value } from "../../engine/read/values.ts";
import { buffer } from "../../stores/buffer/buffer.ts";
import { begun, typed } from "../../stores/buffer/string.ts";
import type { Scope } from "../../integrations/location/location.ts";
import startLocation from "../../integrations/location/machine.ts";
import { applying, found, type Glass } from "../../language/shipped.ts";
import { draw, drawingsAt, type Drawer, type Realization } from "../../chassis/web/chassis.ts";
import { inspecting } from "../../site/inspector.tsx";
import { finder } from "../../chassis/web/find.ts";
import { realizedOn } from "../../chassis/web/realized.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";

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

// What the tests name of glass, by route.
const components = {
  Value: "components/Value",
  List: "components/List",
  Brief: "components/Brief",
  Choose: "components/Choose",
  Problem: "components/Problem",
  Reader: "components/Reader",
  row: "interface/row",
};

// A component's code, loaded from its source, by its path from the repository's root.
const repo = join(import.meta.dir, "../..");
const load = (path: string) => import(join(repo, path)).then((module) => module.default);

describe("the page's read over glass, the interface shipped", () => {
  // An engine over glass, what glass ships found by its routes, and the page's way of
  // drawing a read over them.
  async function page() {
    const { engine } = await shipped();
    const glass = await found((read) => engine.read(read));
    const own = await found((read) => engine.read(read), components);
    const told = await realizedOn((read) => engine.read(read), glass, "web", load, {
      choose: components.Choose,
      fallback: components.Value,
      problem: components.Problem,
    });
    const find = finder((read: Read) => engine.read(read), glass, [...told.realized.keys()], told.fallback);
    const parsed = async (text: string) => {
      const answer = await engine.read(applying(glass, "parse", text));
      if (!("value" in answer)) throw new Error(answer.problem);
      return answer.value as unknown as Read;
    };
    const into = document.createElement("main");
    document.body.replaceChildren(into);
    const drawing = async (text: string) => draw(into, await parsed(text), { engine, glass, ...told });
    return { engine, glass, own, told, find, into, drawing };
  }

  test("Answer, given a text read into uses, draws the holon it names as its values, each reference a link", async () => {
    const { into, drawing, own, told } = await page();
    const stop = await drawing('Answer(parse("@First"))');

    const see = () => into.querySelector(".holon .fields a[data-ref]");
    await settled(() => see()?.textContent === "Second");
    expect(into.querySelector("h1")!.textContent).toBe("First");
    expect(into.querySelector(".words")!.textContent).toBe("Glass holds holons");
    expect(see()!.getAttribute("href")).toBe(`/?q=@${notes.second}`);
    stop();
  });

  test("what a use gives is found the component that takes it by a type of the field; a kind alone finds none", async () => {
    const { glass, find, own, told } = await page();
    for (const given of [3, "three", [1, 2], { gives: 1 }, { $ref: notes.first }])
      expect(await find([given as Value])).toEqual({ component: own.Value, by: "fallback" });
    expect(await find([{ $ref: notes.brief }])).toEqual({ component: own.Brief, by: "type" });
    // All that is given is matched, as a use giving it would be bound: a list with the way
    // it runs finds List by the direction's type; one thing more than Brief takes, none.
    expect(await find([[{ $ref: notes.first }], { $ref: own.row }])).toEqual({
      component: own.List,
      by: "type",
    });
    expect(await find([{ $ref: notes.brief }, 3])).toEqual({ component: own.Value, by: "fallback" });
  });

  test("every component without a body names its code on the web, which draws it by its default export", async () => {
    const { engine, glass, told } = await page();
    const answer = await engine.read(
      applying(
        glass,
        "parse",
        `find(?c, [?c, "instance", @glass:interface/component]) | map(c => {name: c.name, body: c.body, code: c.realized.web})`,
      ),
    );
    if (!("value" in answer)) throw new Error(answer.problem);
    const each = await engine.read(answer.value as unknown as Read);
    if (!("value" in each)) throw new Error(each.problem);
    const all = each.value as { name: string; body: unknown; code: string | null }[];

    expect(
      all
        .filter(({ body }) => body === null)
        .map(({ name }) => name)
        .sort(),
    ).toEqual(
      all
        .filter(({ code }) => code)
        .map(({ name }) => name)
        .sort(),
    );
    for (const { code } of all.filter(({ code }) => code)) expect(existsSync(join(repo, code!))).toBe(true);
    expect([...told.realized.values()].every((realization) => typeof realization === "function")).toBe(true);
    expect(told.realized.size).toBe(all.filter(({ code }) => code).length);
  });

  test("a brief is read as its name, its flow, a brief in its flow as a link, and its sections", async () => {
    const { into, drawing, own, told } = await page();
    const stop = await drawing(`@${notes.brief}`);

    await settled(() => into.querySelector(".brief h2")?.textContent === "Part");
    expect(into.querySelector(".brief h1")!.textContent).toBe("Notes");
    expect([...into.querySelectorAll(".brief p")].map((p) => p.textContent)).toEqual([
      "Notes hold.",
      "Within",
    ]);
    // Its first paragraph reads as the rest do.
    expect(into.querySelector(".brief p")!.classList.contains("lede")).toBe(false);
    // A brief in its flow is a card leading to it, saying what it is.
    const face = into.querySelector<HTMLAnchorElement>(".brief .face a.card")!;
    expect(face.getAttribute("href")).toBe(`/?q=@${notes.inner}`);
    await settled(() => face.querySelector(".card-kind")!.textContent === "brief · in glass");
    expect(face.querySelector(".card-name")!.textContent).toBe("Inner");
    expect(into.querySelector(".brief h2 a")!.getAttribute("href")).toBe(`/?q=@${notes.part}`);
    stop();
  });

  test("moving from one brief to another keeps the first shown until the second and its sections are read", async () => {
    const { engine, glass, into, own, told } = await page();
    await engine.mount("query", buffer(), { write: true });
    const begin = await engine.commit(begun("query", glass));
    if (!("ids" in begin)) throw new Error(JSON.stringify(begin));
    const holon = begin.ids["~2"]!;
    await engine.commit(typed(holon, `@${notes.part}`));
    const read = await engine.read(applying(glass, "parse", 'Reader(get(@query:text, "text"))'));
    if (!("value" in read)) throw new Error(read.problem);
    const stop = await draw(into, read.value as unknown as Read, { engine, glass, ...told });
    await settled(() => into.querySelector(".brief h1")?.textContent === "Part");

    const seen: string[] = [];
    const observer = new MutationObserver(() =>
      seen.push(into.querySelector(".answered")?.textContent ?? ""),
    );
    observer.observe(into, { childList: true, subtree: true, characterData: true });
    await engine.commit(typed(holon, `@${notes.brief}`));
    await settled(() => into.querySelector(".brief h2")?.textContent === "Part");
    observer.disconnect();

    expect(into.querySelector(".brief h1")!.textContent).toBe("Notes");
    expect(seen.every((text) => text.length > 0)).toBe(true);
    expect(seen.filter((text) => text.startsWith("Notes")).every((text) => text.includes("Within"))).toBe(
      true,
    );
    stop();
  });

  test("a holon answered says where it stands: home, then each whole holding it from its store's root, a link back", async () => {
    const { into, drawing, own, told } = await page();
    const stop = await drawing('Answer(parse("@First"))');

    await settled(() => into.querySelector(".trail [aria-current]")?.textContent === "First");
    // Home first, then each whole holding it.
    const wholes = [...into.querySelectorAll<HTMLAnchorElement>(".trail a")];
    expect(wholes.map((a) => a.textContent)).toEqual(["Glass", "glass"]);
    expect(wholes[0]!.getAttribute("href")).toBe("/");
    expect(wholes[1]!.getAttribute("href")).toBe(`/?q=@${id(90)}`);
    stop();
  });

  // What a use is kept as now: what it applies, if anything.
  async function fnOf(engine: Engine, glass: Glass, use: string) {
    const answer = await engine.read(applying(glass, "holon", { $ref: use }));
    return "value" in answer ? ((answer.value as any).body.fn?.$ref as string | undefined) : answer.problem;
  }

  test("a use that names no component is drawn by the one found for it by type, and nothing is written", async () => {
    const { engine, glass, into, told } = await page();
    let commits = 0;
    const counted = {
      ...engine,
      commit: (change: Parameters<Engine["commit"]>[0]) => (commits++, engine.commit(change)),
    };
    const stop = await draw(
      into,
      { gives: { $ref: notes.unnamed, $holds: true } },
      { engine: counted, glass, ...told },
    );

    await settled(() => into.querySelector(".brief h1")?.textContent === "Notes");
    expect(commits).toBe(0);
    expect(await fnOf(engine, glass, notes.unnamed)).toBeUndefined();
    stop();
  });

  test("where several components could draw it, the person chooses, and the pick is held for the page", async () => {
    const { engine, glass, into, own, told } = await page();
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
    // A second component that draws a brief, realized here beside the web's own.
    const realized = new Map([...told.realized, [outline, counting().count]]);
    const stop = await draw(
      into,
      { gives: { $ref: notes.unnamed, $holds: true } },
      { engine, glass, ...told, realized },
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
    expect(await fnOf(engine, glass, notes.unnamed)).toBeUndefined();
    stop();
  });

  test("a use the read carries is found its component each time, and nothing is written", async () => {
    const { engine, glass, into, own, told } = await page();
    const read: Read = {
      gives: { $ref: "~unnamed", $holds: true },
      holons: [{ id: "~unnamed", instance: [glass.use], body: { args: [{ $ref: notes.brief }] } }],
    };
    let commits = 0;
    const counted = {
      ...engine,
      commit: (change: Parameters<Engine["commit"]>[0]) => (commits++, engine.commit(change)),
    };
    const stop = await draw(into, read, { engine: counted, glass, ...told });

    await settled(() => into.querySelector(".brief h1")?.textContent === "Notes");
    expect(commits).toBe(0);
    stop();
  });

  test("a text that does not read is said in place of what it gives", async () => {
    const { into, drawing, own, told } = await page();
    await drawing('Answer(parse("add(1,"))');

    await settled(() => into.querySelector(".note"));
    expect(into.querySelector(".note")!.textContent).toContain("an expression begins here");
  });

  // The page: a query buffer, begun, holding the text given, and Reader drawn over it.
  async function reading(text: string) {
    const { engine, glass, into, drawing, own, told } = await page();
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
    return { engine, glass, own, told, holon, into, stop, held, pills };
  }

  test("a blank text starts at the field's roots, each store a row leading to it", async () => {
    const { into, stop } = await reading("");
    await settled(() => into.querySelector(".card .card-name")?.textContent === "glass");
    expect(into.querySelector(".start h1")!.textContent).toBe("Glass");
    expect(into.querySelector(".card")!.getAttribute("href")).toBe(`/?q=@${id(90)}`);
    stop();
  });

  test("a card says what its holon is: a whole, how many it holds", async () => {
    const { into, stop } = await reading("");
    const glass = () => into.querySelector<HTMLAnchorElement>(`.card[href="/?q=@${id(90)}"]`);
    await settled(() => glass()?.querySelector(".card-says")?.textContent === "12 held");
    expect(glass()!.querySelector(".card-kind")!.textContent).toBe("store");
    stop();
  });

  test("a record's long list of holons is a section under its key, shown as cards, rows or a table, kept for the place", async () => {
    localStorage.clear();
    const { into, stop } = await reading(`@${id(90)}`);
    const contents = () => into.querySelector<HTMLElement>(".holon .field .holons");
    await settled(() => contents()?.querySelector(".card-name")?.textContent === "language");
    // Short fields stand beside their keys; the list is a section of its own, under its key.
    expect([...into.querySelectorAll(".holon .fields dt")].map((dt) => dt.textContent)).toEqual(["shape"]);
    expect(contents()!.querySelector("h2.key")!.textContent).toBe("contents");
    expect(contents()!.querySelector(".rows")!.getAttribute("data-mode")).toBe("cards");
    // Nothing most of them keep, so no table.
    expect(contents()!.querySelector<HTMLButtonElement>('button[data-mode="table"]')!.hidden).toBe(true);

    contents()!.querySelector<HTMLButtonElement>('button[data-mode="rows"]')!.click();
    await settled(() => contents()!.querySelector(".rows")!.getAttribute("data-mode") === "rows");
    expect(localStorage.getItem(`glass:shown:${id(90)}/contents`)).toBe("rows");
    stop();

    // Drawn again, the list is shown as it was last.
    const again = await reading(`@${id(90)}`);
    await settled(
      () => again.into.querySelector(".holon .field .holons .card-name")?.textContent === "language",
    );
    expect(again.into.querySelector(".holon .field .rows")!.getAttribute("data-mode")).toBe("rows");
    again.stop();
  });

  test("holons keeping the same fields may be shown as a table of them", async () => {
    localStorage.clear();
    const { into, stop } = await reading(`[@First, @${notes.query}]`);
    const table = () => into.querySelector<HTMLButtonElement>('.holons button[data-mode="table"]');
    await settled(() => table() && !table()!.hidden);
    table()!.click();
    await settled(() => into.querySelector(".table tbody"));
    expect([...into.querySelectorAll(".table thead th")].map((th) => th.textContent)).toEqual([
      "name",
      "text",
    ]);
    expect([...into.querySelectorAll(".table tbody tr")].map((tr) => tr.textContent)).toEqual([
      "FirstGlass holds holons",
      "query1 | add(2) | add(3)",
    ]);
    expect(into.querySelector<HTMLElement>(".holons .rows")!.hidden).toBe(true);
    stop();
  });

  test("typed into, the bar offers the functions that exist, and the holons by name, to be taken", async () => {
    const { into, stop } = await reading("@First");
    await settled(() => into.querySelector("h1")?.textContent === "First");
    const input = into.querySelector<HTMLInputElement>(".expression-input input")!;
    const offered = () => [...into.querySelectorAll(".completions li .name")].map((name) => name.textContent);
    const typing = (text: string) => {
      input.value = text;
      input.setSelectionRange(text.length, text.length);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const pressing = (key: string) =>
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

    typing("| ge");
    await settled(() => offered()[0] === "get");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    pressing("ArrowDown");
    expect(into.querySelector('.completions li[aria-selected="true"] .name')!.textContent).toBe("get");
    pressing("Enter");
    expect(input.value).toBe("| get");
    expect(offered()).toEqual([]);

    typing("@Sec");
    await settled(() => offered()[0] === "Second");
    pressing("Tab");
    expect(input.value).toBe("@Second");

    // Escape puts the options away, and leaves what is typed.
    typing("| ma");
    await settled(() => offered().includes("map"));
    pressing("Escape");
    expect(offered()).toEqual([]);
    expect(input.value).toBe("| ma");
    stop();
  });

  test("pressed with the other button, a place shows what draws it, what it was given, the way to it, and what it shows", async () => {
    const { engine, glass, own, told, into, stop } = await reading("@First");
    const root = await engine.read(applying(glass, "parse", 'Reader(get(@query:text, "text"))'));
    if (!("value" in root)) throw new Error(root.problem);
    const stopInspecting = inspecting(into, {
      engine,
      glass,
      root: root.value as unknown as Read,
      names: told.names,
    });
    const see = () => into.querySelector(".holon .fields a[data-ref]");
    await settled(() => see()?.textContent === "Second");

    const pressed = (shiftKey = false) =>
      see()!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, shiftKey }));
    // With shift held, the browser's own menu.
    expect(pressed(true)).toBe(true);
    expect(document.querySelector(".inspector")).toBeNull();

    expect(pressed()).toBe(false);
    await settled(() => document.querySelector(".inspector .shows"));
    const panel = document.querySelector(".inspector")!;
    expect(panel.querySelector("h2")!.textContent).toBe("Value");
    // The place is the link pressed: drawn by the Value around it, given what it leads to.
    expect([...panel.querySelectorAll(".path a")].map((a) => a.textContent)).toEqual([
      "Reader",
      "List",
      "Answer",
      "Value · First",
    ]);
    expect(panel.querySelector(".given")!.textContent).toBe("Second");
    expect([...into.querySelectorAll(".inspected")]).toEqual([see()!]);
    expect(panel.querySelector(".shows .name")!.textContent).toBe("Second");
    expect(panel.querySelector(".shows code")!.textContent).toBe("@Second");
    expect(panel.textContent).toContain(notes.second);
    expect(panel.querySelector("footer a")!.getAttribute("href")).toBe(`/?q=@${own.Reader}`);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".inspector")).toBeNull();
    expect(into.querySelector(".inspected")).toBeNull();

    // Pressed on the record itself, the place is the drawing, its parents the way to it.
    into
      .querySelector("h1")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await settled(() => document.querySelector(".inspector .given"));
    const drawing = document.querySelector(".inspector")!;
    expect(drawing.querySelector(".given")!.textContent).toBe("First");
    expect([...drawing.querySelectorAll(".path a")].map((a) => a.textContent)).toEqual([
      "Reader",
      "List",
      "Answer",
    ]);
    expect(into.querySelector(".inspected")!.classList.contains("value")).toBe(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    stopInspecting();
    stop();
  });

  // What is typed into the input, then Enter or another key pressed.
  const typing = (input: HTMLInputElement, text: string, key = "Enter") => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (key === "Enter") input.form!.requestSubmit();
    else input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  };

  test("the input holds only what is typed next: a step added with |, or a text asked anew", async () => {
    const { into, stop, held, pills } = await reading("@First");
    await settled(() => into.querySelector("h1")?.textContent === "First");

    const input = into.querySelector<HTMLInputElement>(".expression-input input")!;
    expect(input.value).toBe("");
    expect(input.placeholder).toContain("add a step");
    input.focus();

    typing(input, '| get("text")');
    await settled(() => into.querySelector(".answered")!.textContent === "Glass holds holons");
    expect(await held()).toBe('@First | get("text")');
    await settled(() => pills().length === 2);
    expect(input.value).toBe("");

    typing(input, "@Second");
    await settled(() => into.querySelector("h1")?.textContent === "Second");
    expect(await held()).toBe("@Second");
    expect(into.querySelector(".expression-input input")).toBe(input);
    // Asked, the page returns to where it stands: the input let go, the trail shown.
    expect(document.activeElement).not.toBe(input);
    expect(document.body.classList.contains("asking")).toBe(false);
    expect(input.value).toBe("");
    expect(input.readOnly).toBe(false);
    stop();
  });

  test("Backspace in the empty input takes the last step back into it, the text without it asked", async () => {
    const { into, stop, held, pills } = await reading('@First | get("text")');
    await settled(() => pills().length === 2 && pills().every(Boolean));
    const input = into.querySelector<HTMLInputElement>(".expression-input input")!;

    typing(input, "", "Backspace");
    await settled(() => input.value === '| get("text")');
    expect(await held()).toBe("@First");
    await settled(() => pills().length === 1);

    typing(input, '| get("see")');
    await settled(async () => (await held()) === '@First | get("see")');
    expect(input.value).toBe("");
    stop();
  });

  // The page as it stands: the browser's address projected by the location, and Reader
  // drawn over its param q.
  async function located(address: string, scope: Scope = "page") {
    history.replaceState(null, "", address);
    const { engine, glass, into, drawing } = await page();
    await engine.mount("location", await startLocation({ scope }), { write: true });
    const drawn = await drawing('Reader(get(@location:params, "q"))');
    // The drawing stopped and the location let go, so it follows the browser no longer.
    const stop = () => {
      drawn();
      void engine.unmount("location");
    };
    const asked = await engine.read(applying(glass, "parse", 'get(@location:params, "q")'));
    if (!("value" in asked)) throw new Error(asked.problem);
    const held = async () => {
      const answer = await engine.read(asked.value as unknown as Read);
      return "value" in answer ? answer.value : answer.problem;
    };
    const pills = () => [...into.querySelectorAll(".pill .said")].map((said) => said.textContent);
    return { engine, glass, into, stop, held, pills };
  }

  test("the location projects the address, what it asks and the history, and a param written moves the address", async () => {
    const { engine, glass, stop } = await located("/next/?q=@First&shown=cards#top");
    const read = async (text: string) => {
      const asked = await engine.read(applying(glass, "parse", text));
      if (!("value" in asked)) throw new Error(asked.problem);
      const answer = await engine.read(asked.value as unknown as Read);
      if (!("value" in answer)) throw new Error(answer.problem);
      return answer.value;
    };
    expect(await read('@location:address | holon | get("body")')).toEqual({
      origin: location.origin,
      path: "/next/",
      hash: "#top",
    });
    expect(await read('@location:params | holon | get("body")')).toEqual({ q: "@First", shown: "cards" });
    expect(await read('get(@location:history, "length")')).toBe(history.length);

    const steps = history.length;
    const params = await read("@location:params | holon");
    const done = await engine.commit({
      holons: [{ ...(params as any), body: { q: "@Second", shown: "cards" } }],
      says: "asked anew",
      at: {},
    });
    expect("refused" in done).toBe(false);
    expect(decodeURIComponent(location.search)).toBe("?q=@Second&shown=cards");
    expect(location.hash).toBe("#top");
    expect(history.length).toBe(steps + 1);

    const entries = await engine.commit({
      holons: [{ ...((await read("@location:history | holon")) as any), body: { length: 1 } }],
      says: "the history rewritten",
      at: {},
    });
    // The location refuses it, and so it lands nowhere.
    expect(entries).toMatchObject({ landed: {}, missed: { location: { refused: [{ rule: "location" }] } } });
    stop();
  });

  test("a location takes only its page, unless it takes its whole origin, as a single-page app", async () => {
    for (const scope of ["page", "origin"] as const) {
      const { engine, glass, stop } = await located("/next/?q=@First", scope);
      const asked = await engine.read(applying(glass, "parse", "@location:address | holon"));
      if (!("value" in asked)) throw new Error(asked.problem);
      const address = await engine.read(asked.value as unknown as Read);
      if (!("value" in address)) throw new Error(address.problem);
      const moving = (body: Record<string, string>) =>
        engine.commit({ holons: [{ ...(address.value as any), body }], says: "moved", at: {} });

      const elsewhere = await moving({ origin: "https://elsewhere.example", path: "/", hash: "" });
      expect(elsewhere).toMatchObject({
        landed: {},
        missed: { location: { refused: [{ rule: "location" }] } },
      });

      const other = await moving({ origin: location.origin, path: "/other/", hash: "" });
      if (scope === "page") {
        expect(other).toMatchObject({
          landed: {},
          missed: { location: { refused: [{ rule: "location" }] } },
        });
        expect(location.pathname).toBe("/next/");
      } else {
        expect(other).toMatchObject({ landed: { location: {} } });
        expect(location.pathname).toBe("/other/");
        expect(decodeURIComponent(location.search)).toBe("?q=@First");
      }
      stop();
    }
  });

  test("a location let go follows the browser no longer", async () => {
    const { engine, glass, stop } = await located("/next/?q=@First");
    const heads: unknown[] = [];
    const parsed = await engine.read(applying(glass, "parse", 'get(@location:params, "q")'));
    if (!("value" in parsed)) throw new Error(parsed.problem);
    const unsubscribe = await engine.subscribe(parsed.value as unknown as Read, (answer) =>
      heads.push("value" in answer ? answer.value : answer.problem),
    );
    history.replaceState(null, "", "/next/?q=@Second");
    window.dispatchEvent(new Event("popstate"));
    await settled(() => heads.at(-1) === "@Second");

    unsubscribe();
    stop();
    await Bun.sleep(20);
    const told = heads.length;
    history.replaceState(null, "", "/next/?q=@First");
    window.dispatchEvent(new Event("popstate"));
    await Bun.sleep(50);
    expect(heads.length).toBe(told);
  });

  test("a text's steps are drawn as pills; × takes one out, the address following as a step", async () => {
    const { into, stop, held, pills } = await located("/next/?q=1 | add(2) | add(3)");

    await settled(() => pills().length === 3 && pills().every(Boolean));
    expect(pills()).toEqual(["1", "add(2)", "add(3)"]);
    await settled(() => into.querySelector(".answered")!.textContent === "6");
    const steps = history.length;

    into.querySelectorAll<HTMLButtonElement>(".pill button")[1]!.click();
    await settled(() => pills().length === 2 && into.querySelector(".answered")!.textContent === "4");
    expect(await held()).toBe("add(1, 3)");
    expect(pills()).toEqual(["1", "add(3)"]);
    // The input holds none of what is asked: the pills say it.
    expect(into.querySelector<HTMLInputElement>(".expression-input input")!.value).toBe("");
    expect(history.length).toBe(steps + 1);
    expect(decodeURIComponent(location.search)).toBe("?q=add(1, 3)");
    stop();
  });

  test("× says the holons left by their names, and the last one taken out leaves the address blank", async () => {
    const { into, stop, held, pills } = await located(`/next/?q=@First | get("see")`);

    await settled(() => pills().length === 2 && pills().every(Boolean));
    expect(pills()).toEqual(["@First", 'get("see")']);

    into.querySelectorAll<HTMLButtonElement>(".pill button")[1]!.click();
    await settled(() => pills().length === 1);
    expect(await held()).toBe("@First");
    expect(decodeURIComponent(location.search)).toBe("?q=@First");

    into.querySelector<HTMLButtonElement>(".pill button")!.click();
    await settled(() => pills().length === 0);
    // An empty param is no param: the address asks nothing.
    expect(await held()).toBe(null);
    // The answer before stays until the start is read, then the start alone is shown.
    await settled(() => into.querySelector(".answered header.start"));
    expect(into.querySelector(".note")).toBeNull();
    expect(location.search).toBe("");
    stop();
  });

  test("the browser moving through its history moves the query", async () => {
    const { into, stop, held } = await located("/next/?q=@First");
    expect(await held()).toBe("@First");
    await settled(() => into.querySelector("h1")?.textContent === "First");

    history.replaceState(null, "", "/next/?q=@Second");
    window.dispatchEvent(new Event("popstate"));
    await settled(() => into.querySelector("h1")?.textContent === "Second");
    expect(await held()).toBe("@Second");
    stop();
  });

  test("with the Navigation API, a link followed within the scope moves the location, no page loaded", async () => {
    const navigation = Object.assign(new EventTarget(), {
      entries: () => [{ url: location.href, key: "0", index: 0 }],
      currentEntry: { url: location.href, key: "0", index: 0 },
    });
    (globalThis as { navigation?: EventTarget }).navigation = navigation;
    try {
      const { into, stop, held } = await located("/next/?q=@First", "origin");
      const see = () => into.querySelector<HTMLAnchorElement>(".holon .fields a[data-ref]");
      await settled(() => see()?.textContent === "Second");

      let intercepted = false;
      const going = Object.assign(new Event("navigate"), {
        destination: { url: new URL(see()!.getAttribute("href")!, location.href).href },
        canIntercept: true,
        hashChange: false,
        downloadRequest: null,
        navigationType: "push",
        intercept: () => void (intercepted = true),
      });
      navigation.dispatchEvent(going);
      expect(intercepted).toBe(true);
      // The browser, the navigation taken, commits the address and says so.
      history.pushState(null, "", going.destination.url);
      navigation.dispatchEvent(new Event("currententrychange"));

      await settled(() => into.querySelector("h1")?.textContent === "Second");
      expect(await held()).toBe(`@${notes.second}`);
      stop();
    } finally {
      delete (globalThis as { navigation?: EventTarget }).navigation;
    }
  });
});
