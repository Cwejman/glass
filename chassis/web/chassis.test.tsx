// The chassis in a page of its own: drawings found by their component's id and kept in
// place as answers come, shown once what they read has answered, and their reads asked
// together, over an engine whose answers the test gives, drawn by components realized
// for the test alone.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { beforeAll, describe, expect, test } from "bun:test";
import { h } from "../../components/web/jsx.ts";
import type { Answer, Read } from "../../engine/engine.ts";
import type { Value } from "../../engine/read/values.ts";
import { q, type Glass } from "../../language/shipped.ts";
import { draw, drawingsAt, type Drawer, type Realization } from "./chassis.ts";

beforeAll(() => {
  if (!globalThis.document) GlobalRegistrator.register({ url: "https://glass.test/next/" });
});

const settled = async (test: () => unknown, within = 2000) => {
  for (const start = performance.now(); !(await test()); await Bun.sleep(5))
    if (performance.now() - start > within) throw new Error("it did not settle");
};
const turns = () => Bun.sleep(5);

const [valueId, listId, countId, readingId, problemId] = ["value", "list", "count", "reading", "problem"];

// Nothing here asks glass for what it ships, but the ids of what is applied by name.
const glass = { use: "use", quote: "quote", print: "print", holon: "holon" } as unknown as Glass;
const told = { names: new Map<string, string>(), choose: "", fallback: "", problem: problemId };

// A number in bold that keeps its node, counting what it makes and lets go.
function counting() {
  const seen = { made: 0, gone: 0 };
  const count: Realization = (given) => {
    seen.made++;
    const node = <b class="count">{String(given[0])}</b>;
    return {
      node,
      update: ([n]) => void (node.textContent = String(n)),
      dispose: () => void seen.gone++,
    };
  };
  return { count, seen };
}

// A value as its text; a list, each item drawn in turn; what print says of what it is
// given, read; and a problem, said.
const value: Realization = ([shownNow]) => <span class="value">{String(shownNow)}</span>;
const list: Realization = ([items], io) => (
  <div class="list">{(Array.isArray(items) ? items : []).map((item, i) => io.draw(item, i))}</div>
);
const reading: Realization = ([asked], io) => {
  const said = io.read(q`print(${asked ?? null})`);
  return <i class="reading">{String(said ?? "")}</i>;
};
const problem: Realization = ([said]) => <p class="problem">{String(said)}</p>;

// An engine whose root subscription answers what the test gives it, and whose every
// other read waits until the test answers it: each answered by what answer() gives. What
// it parses is a lambda of the language, its body nothing more.
function engineOf(answer: (read: Read) => Value | Error = () => null) {
  let root: ((answer: Answer) => void) | undefined;
  const asked: { read: Read; told: (answer: Answer) => void; stopped: boolean }[] = [];
  const engine: Drawer["engine"] = {
    // The way back finds no change; anything else asked is a text to parse.
    read: async (read) =>
      read.holons?.some(({ id }) => id === "~proposed")
        ? { at: {}, value: null }
        : {
            at: {},
            value: { gives: { $ref: "~1", $holds: true }, holons: [{ id: "~1", instance: [], body: {} }] },
          },
    subscribe: async (read, heard) => {
      if (read.gives === null) {
        root = heard;
        return () => void (root = undefined);
      }
      const one = { read, told: heard, stopped: false };
      asked.push(one);
      return () => void (one.stopped = true);
    },
    commit: async () => ({ refused: [] }),
  };
  const answerAll = () => {
    for (const one of asked.splice(0)) {
      const given = answer(one.read);
      one.told(given instanceof Error ? { at: {}, problem: given.message } : { at: {}, value: given });
    }
  };
  return { engine, asked, answerAll, giving: (value: Value) => root?.({ at: {}, value }) };
}

const counted = (n: number, at: string) => ({ $draw: { $ref: countId }, given: [n], at: [at] });

describe("drawing what an engine gives", () => {
  test("each drawing is drawn by the component it names, and kept in place as answers come", async () => {
    const { engine, giving } = engineOf();
    const { count, seen } = counting();
    const realized = new Map([
      [valueId, value],
      [listId, list],
      [countId, count],
    ]);
    const page = document.createElement("main");
    const find = ([found]: Value[]) => ({
      component: Array.isArray(found) ? listId : valueId,
      by: "fallback" as const,
    });
    const stop = await draw(page, { gives: null }, { engine, glass, realized, find, ...told });

    giving([counted(1, "a"), counted(2, "b")]);
    await settled(() => page.querySelectorAll(".count").length === 2);
    const drawn = [...page.querySelectorAll(".count")];
    expect(drawn.map((each) => each.textContent)).toEqual(["1", "2"]);

    giving([counted(5, "a"), counted(2, "b")]);
    await turns();
    expect([...page.querySelectorAll(".count")]).toEqual(drawn);
    expect(drawn[0]!.textContent).toBe("5");
    expect(seen).toEqual({ made: 2, gone: 0 });

    // Kept by what it is, not where it stands: the second drawn first is still itself.
    giving([counted(2, "b")]);
    await turns();
    expect([...page.querySelectorAll(".count")]).toEqual([drawn[1]!]);
    expect(seen).toEqual({ made: 2, gone: 1 });

    // The same component reached by another way is another drawing.
    giving([counted(5, "c")]);
    await settled(() => seen.made === 3);
    expect(seen.gone).toBe(2);

    stop();
    expect(seen.gone).toBe(3);
  });

  test("a drawing made anew is shown once every read it asked has answered, what was there kept until then", async () => {
    const { engine, giving, asked, answerAll } = engineOf((read) => JSON.stringify(read.holons?.length));
    const { count } = counting();
    const realized = new Map([
      [countId, count],
      [readingId, reading],
    ]);
    const page = document.createElement("main");
    await draw(
      page,
      { gives: null },
      { engine, glass, realized, find: () => ({ component: countId, by: "fallback" }), ...told },
    );

    giving(counted(1, "a"));
    await settled(() => page.textContent === "1");

    giving({ $draw: { $ref: readingId }, given: ["x"], at: ["a"] });
    await settled(() => asked.length === 1);
    expect(page.textContent).toBe("1");
    expect(page.querySelector(".reading")).toBeNull();

    answerAll();
    await settled(() => page.querySelector(".reading"));
    expect(page.querySelector(".count")).toBeNull();
    expect(page.querySelector(".reading")!.textContent).not.toBe("");
    expect(drawingsAt(page.querySelector(".reading")).map(({ component }) => component)).toEqual([readingId]);
  });

  test("a drawing given something else renders again, laid over what it showed", async () => {
    const { engine, giving } = engineOf();
    const page = document.createElement("main");
    await draw(
      page,
      { gives: null },
      {
        engine,
        glass,
        realized: new Map([[valueId, value]]),
        find: () => ({ component: valueId, by: "fallback" }),
        ...told,
      },
    );
    const valued = (v: string) => ({ $draw: { $ref: valueId }, given: [v], at: ["a"] });

    giving(valued("one"));
    await settled(() => page.querySelector(".value"));
    const first = page.querySelector(".value");

    giving(valued("one"));
    await turns();
    expect(page.querySelector(".value")).toBe(first);

    giving(valued("two"));
    await settled(() => page.textContent === "two");
    expect(page.querySelector(".value")).toBe(first);
  });

  test("the reads asked in one turn go to the engine as one read; where it fails, each is asked alone, and one failing fails its drawing alone", async () => {
    const failing = (read: Read) => JSON.stringify(read).includes("bad");
    const { engine, giving, asked, answerAll } = engineOf((read) =>
      failing(read)
        ? new Error("it does not print")
        : Array.isArray(read.gives)
          ? read.gives.map((_, i) => `said ${i}`)
          : "said alone",
    );
    const page = document.createElement("main");
    await draw(
      page,
      { gives: null },
      {
        engine,
        glass,
        realized: new Map([
          [listId, list],
          [readingId, reading],
          [problemId, problem],
        ]),
        find: () => ({ component: listId, by: "fallback" }),
        ...told,
      },
    );
    const read = (what: string, at: string) => ({ $draw: { $ref: readingId }, given: [what], at: [at] });

    giving([read("a", "1"), read("b", "2"), read("c", "3")]);
    await settled(() => asked.length > 0);
    expect(asked.length).toBe(1);
    expect(asked[0]!.read.gives).toHaveLength(3);
    answerAll();
    await settled(() => page.querySelectorAll(".reading").length === 3);
    expect([...page.querySelectorAll(".reading")].map((each) => each.textContent)).toEqual([
      "said 0",
      "said 1",
      "said 2",
    ]);

    giving([read("d", "4"), read("bad", "5"), read("e", "6")]);
    await settled(() => asked.length > 0);
    expect(asked.length).toBe(1);
    answerAll();
    await settled(() => asked.length === 3);
    answerAll();
    // The one that failed is a problem in its place; the others say what they read.
    await settled(() => page.querySelector(".problem"));
    expect([...page.querySelectorAll(".reading, .problem")].map((each) => each.textContent)).toEqual([
      "said alone",
      "it does not print",
      "said alone",
    ]);
  });

  test("a drawing let go stops what it read, and the page is told while it waits", async () => {
    const { engine, giving, asked, answerAll } = engineOf(() => "said");
    const page = document.createElement("main");
    const busy: boolean[] = [];
    const stop = await draw(
      page,
      { gives: null },
      {
        engine,
        glass,
        realized: new Map([[readingId, reading]]),
        find: () => ({ component: readingId, by: "fallback" }),
        reading: (now) => void busy.push(now),
        ...told,
      },
    );

    giving({ $draw: { $ref: readingId }, given: ["x"], at: ["a"] });
    await settled(() => asked.length === 1);
    const subscription = asked[0]!;
    expect(busy).toEqual([true]);
    answerAll();
    await settled(() => busy.length === 2);
    expect(busy).toEqual([true, false]);

    stop();
    expect(subscription.stopped).toBe(true);
  });

  test("a drawing within another keeps following the field when the one around it draws again", async () => {
    const { engine, giving, asked, answerAll } = engineOf(() => "first");
    const page = document.createElement("main");
    await draw(
      page,
      { gives: null },
      {
        engine,
        glass,
        realized: new Map([
          [listId, list],
          [readingId, reading],
        ]),
        find: () => ({ component: listId, by: "fallback" }),
        ...told,
      },
    );
    const items = [{ $draw: { $ref: readingId }, given: ["x"], at: ["1"] }];

    giving(items);
    await settled(() => asked.length === 1);
    const subscription = asked[0]!;
    answerAll();
    await settled(() => page.querySelector(".reading")?.textContent === "first");

    // The list draws again, another item beside the one kept.
    giving([...items, { $draw: { $ref: readingId }, given: ["y"], at: ["2"] }]);
    await settled(() => asked.length === 1);
    answerAll();
    await settled(() => page.querySelectorAll(".reading").length === 2);
    expect(subscription.stopped).toBe(false);
    subscription.told({ at: {}, value: "then" });
    await settled(() => page.querySelector(".reading")?.textContent === "then");
  });

  test("each drawing is a boundary: where it fails, the problem is drawn in its place, and the rest stays", async () => {
    const { engine, giving } = engineOf();
    const breaking: Realization = () => {
      throw new Error("it cannot be drawn");
    };
    const page = document.createElement("main");
    await draw(
      page,
      { gives: null },
      {
        engine,
        glass,
        realized: new Map([
          [listId, list],
          [valueId, value],
          ["breaking", breaking],
          [problemId, problem],
        ]),
        find: () => ({ component: listId, by: "fallback" }),
        ...told,
      },
    );

    giving([
      { $draw: { $ref: valueId }, given: ["fine"], at: ["1"] },
      { $draw: { $ref: "breaking" }, given: [], at: ["2"] },
      { $draw: { $ref: valueId }, given: [], at: ["3"], problem: "what it is given does not read" },
    ]);
    await settled(() => page.querySelectorAll(".problem").length === 2);
    expect([...page.querySelectorAll(".value, .problem")].map((each) => each.textContent)).toEqual([
      "fine",
      "it cannot be drawn",
      "what it is given does not read",
    ]);
  });

  test("a drawing fails only itself: not the one replacing it, and not once it is let go", async () => {
    const { engine, giving, asked, answerAll } = engineOf(() => "second");
    const page = document.createElement("main");
    await draw(
      page,
      { gives: null },
      {
        engine,
        glass,
        realized: new Map([
          [readingId, reading],
          [problemId, problem],
        ]),
        find: () => ({ component: readingId, by: "fallback" }),
        ...told,
      },
    );
    const reading_ = (what: string) => ({ $draw: { $ref: readingId }, given: [what], at: ["a"] });

    giving(reading_("x"));
    await settled(() => asked.length === 1);
    const first = asked[0]!;
    answerAll();
    await settled(() => page.querySelector(".reading")?.textContent === "second");

    // Another is given, and waits on its read, as the one shown meets a problem.
    giving(reading_("y"));
    await settled(() => asked.length === 1);
    first.told({ at: {}, problem: "the old read broke" });
    answerAll();
    await settled(
      () => page.querySelector(".reading")?.textContent === "second" && !page.querySelector(".problem"),
    );
    await turns();
    expect(page.querySelector(".problem")).toBeNull();
  });

  test("failing as it renders, a drawing is not shown, its problem is", async () => {
    const { engine, giving } = engineOf();
    const failing: Realization = () => {
      throw new Error("it fails at once");
    };
    const page = document.createElement("main");
    await draw(
      page,
      { gives: null },
      {
        engine,
        glass,
        realized: new Map([
          ["failing", failing],
          [problemId, problem],
        ]),
        find: () => ({ component: "failing", by: "fallback" }),
        ...told,
      },
    );

    giving({ $draw: { $ref: "failing" }, given: [], at: ["a"] });
    await settled(() => page.querySelector(".problem"));
    await turns();
    expect(page.querySelector(".made")).toBeNull();
    expect(page.querySelector(".problem")!.textContent).toBe("it fails at once");
  });

  test("rendered again, what the browser keeps stays: the same input, still focused, given the new handler", async () => {
    const { engine, giving } = engineOf();
    const pressed: string[] = [];
    const form: Realization = ([word]) => (
      <form onSubmit={(event: Event) => (event.preventDefault(), pressed.push(String(word)))}>
        <label>{String(word)}</label>
        <input type="text" />
      </form>
    );
    const page = document.createElement("main");
    document.body.replaceChildren(page);
    await draw(
      page,
      { gives: null },
      {
        engine,
        glass,
        realized: new Map([["form", form]]),
        find: () => ({ component: "form", by: "fallback" }),
        ...told,
      },
    );
    const formed = (word: string) => ({ $draw: { $ref: "form" }, given: [word], at: ["a"] });

    giving(formed("one"));
    await settled(() => page.querySelector("label")?.textContent === "one");
    const input = page.querySelector("input")!;
    input.focus();
    input.value = "typed";

    giving(formed("two"));
    await settled(() => page.querySelector("label")?.textContent === "two");
    expect(page.querySelector("input")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("typed");
    page.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(pressed).toEqual(["two"]);
  });

  test("where the way back finds no change, the place is marked fixed, and stays so as it renders again", async () => {
    const { engine, giving } = engineOf();
    const editing: Realization = ([word], io) => (
      <button type="button" onClick={() => void io.propose("changed")}>
        {String(word)}
      </button>
    );
    const page = document.createElement("main");
    await draw(
      page,
      { gives: null },
      {
        engine,
        glass,
        realized: new Map([["editing", editing]]),
        find: () => ({ component: "editing", by: "fallback" }),
        ...told,
      },
    );
    const edited = (word: string) => ({ $draw: { $ref: "editing" }, given: [word], at: ["a"] });

    giving(edited("one"));
    await settled(() => page.querySelector("button")?.textContent === "one");
    page.querySelector("button")!.click();
    await settled(() => page.querySelector("[data-fixed]"));

    giving(edited("two"));
    await settled(() => page.querySelector("button")?.textContent === "two");
    expect(page.querySelector("[data-fixed] > button")).not.toBeNull();
  });

  test("a use naming no component, or one not realized here, is drawn by the one found for it", async () => {
    const { engine, giving } = engineOf();
    const page = document.createElement("main");
    await draw(
      page,
      { gives: null },
      {
        engine,
        glass,
        realized: new Map([[valueId, value]]),
        find: () => ({ component: valueId, by: "fallback" }),
        ...told,
      },
    );

    giving({ $draw: null, given: ["found by type"], at: ["a"] });
    await settled(() => page.textContent === "found by type");

    giving({ $draw: { $ref: "elsewhere" }, given: [42], at: ["b"] });
    await settled(() => page.textContent === "42");
  });
});
