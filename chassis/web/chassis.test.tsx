// The chassis in a page of its own: drawings found by their component's id and kept in
// place as answers come, over an engine whose answers the test gives, drawn by components
// realized for the test alone.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { beforeAll, describe, expect, test } from "bun:test";
import { h } from "./jsx.ts";
import type { Answer } from "../../engine/engine.ts";
import type { Value } from "../../engine/read/values.ts";
import type { Glass } from "../../language/shipped.ts";
import { arrange, draw, drawingsAt, type Drawer, type Realization } from "./chassis.ts";

beforeAll(() => {
  if (!globalThis.document) GlobalRegistrator.register({ url: "https://glass.test/next/" });
});

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
  // Nothing here asks glass for what it ships, and nothing here chooses.
  const glass = {} as Glass;
  const told = { names: new Map<string, string>(), choose: "", fallback: "" };

  // A value as its text; and a list, each item drawn in turn through the space.
  const value: Realization = (given) => {
    const node = (<span class="value">{String(given[0])}</span>) as HTMLElement;
    return { node, update: ([shown]) => void (node.textContent = String(shown)) };
  };
  const list: Realization = (given, space) => {
    const node = (<div class="list" />) as HTMLElement;
    const update = ([items]: Value[]) =>
      space.redraw(() =>
        arrange(
          node,
          (Array.isArray(items) ? items : []).map((item, i) => space.draw(item, i)),
        ),
      );
    update(given);
    return { node, update };
  };

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
    const find = ([found]: Value[]) => ({
      component: Array.isArray(found) ? listId : valueId,
      by: "fallback" as const,
    });
    const stop = await draw(page, { gives: null }, { engine, glass, realized, find, ...told });

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

  test("a drawing made anew at a place keeps what was there shown until it shows something itself", async () => {
    const { engine, answer: giving } = given();
    const { count } = counting();
    let fill: ((text: string) => void) | undefined;
    const slow: Realization = () => {
      const node = (<i class="slow" />) as HTMLElement;
      fill = (text) => void (node.textContent = text);
      return { node, update: () => {} };
    };
    const realized = new Map([
      [countId, count],
      ["slow", slow],
    ]);
    const page = document.createElement("main");
    await draw(
      page,
      { gives: null },
      { engine, glass, realized, find: () => ({ component: countId, by: "fallback" }), ...told },
    );

    giving(counted(1, "a"));
    expect(page.textContent).toBe("1");

    giving({ $draw: { $ref: "slow" }, given: [], at: ["a"] });
    expect(page.querySelector(".count")!.textContent).toBe("1");
    expect(page.querySelector(".slow")).toBeNull();

    fill!("ready");
    await settled(() => page.querySelector(".slow"));
    expect(page.textContent).toBe("ready");
    expect(drawingsAt(page.querySelector(".slow")).map(({ component }) => component)).toEqual(["slow"]);
  });

  test("a use naming no component, or one not realized here, is drawn by the one found for it", async () => {
    const { engine, answer: giving } = given();
    const realized = new Map([[valueId, value]]);
    const page = document.createElement("main");
    await draw(
      page,
      { gives: null },
      { engine, glass, realized, find: () => ({ component: valueId, by: "fallback" }), ...told },
    );

    giving({ $draw: null, given: ["found by type"], at: ["a"] });
    expect(page.textContent).toBe("found by type");

    giving({ $draw: { $ref: "elsewhere" }, given: [42], at: ["b"] });
    expect(page.textContent).toBe("42");
  });
});
