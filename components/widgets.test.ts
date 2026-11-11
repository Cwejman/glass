// The widgets a board names, drawn over a space that knows a few holons: a count says
// how many, bars count by a key the most first, a timeline places each in time; and a
// board opens each widget as its own slot, drawn by the component it names.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { beforeAll, expect, test } from "bun:test";
import type { Given, Opening, Space, Where } from "../interface/component.ts";

beforeAll(() => {
  if (!globalThis.document) GlobalRegistrator.register({ url: "https://glass.test/" });
});

const holons: Record<string, { name?: string; body: Record<string, unknown> }> = {
  a: {
    name: "Step 2",
    body: { stands: "open", began: "2026-11-11T13:00:00Z", ended: "2026-11-11T14:00:00Z" },
  },
  b: { name: "Step 3", body: { stands: "leaning", began: "2026-11-11T14:00:00Z" } },
  c: { name: "A thread", body: { stands: "open" } },
  d: { name: "Another", body: {} },
};

const opened: { where: Where; opening?: Opening }[] = [];
const space = {
  holon: async (id: string) => (holons[id] ? { id, types: [], ...holons[id] } : null),
  open: (where: Where, opening?: Opening) => {
    opened.push({ where, opening });
    return document.createElement("div");
  },
} as unknown as Space;

const given = (list: string[], settings = {}) =>
  ({ list, settings, kind: "full" }) as unknown as Given<never, never>;
const textOf = (node: Node) => (node as HTMLElement).textContent;

test("a count says how many it is given", async () => {
  const { default: count } = await import("./count.tsx");
  expect(textOf(count(given(["a", "b", "c"])))).toBe("3");
  expect(textOf(count(given([])))).toBe("0");
});

test("bars count by the key named, the most first, what holds none counted as unsaid", async () => {
  const { default: bars } = await import("./bars.tsx");
  const drawn = (await bars(given(["a", "b", "c", "d"], { by: "stands" }), space)) as HTMLElement;
  const rows = [...drawn.querySelectorAll("dt")].map((term, i) => [
    term.textContent,
    drawn.querySelectorAll(".tally")[i]!.textContent,
  ]);

  expect(rows).toEqual([
    ["open", "2"],
    ["leaning", "1"],
    ["unsaid", "1"],
  ]);
});

test("a timeline places each in time in order, one with no end said to be running", async () => {
  const { default: timeline } = await import("./timeline.tsx");
  const drawn = (await timeline(
    given(["b", "a", "c"], { from: "began", to: "ended" }),
    space,
  )) as HTMLElement;
  const labels = [...drawn.querySelectorAll(".label")].map((label) => label.textContent);

  expect(labels).toHaveLength(2);
  expect(labels[0]).toStartWith("Step 2 · ");
  expect(labels[1]).toEndWith(", running");
  expect(drawn.textContent).toContain("1 hold no moment to begin");
});

test("a board opens each widget as its own slot, by the component it names, at its span", async () => {
  const { default: board } = await import("./board.tsx");
  opened.length = 0;
  const gathers = { $ref: "1M6YBY3G0000001" };
  const drawn = (await board(
    {
      holon: {
        id: "x",
        name: "The work, live",
        types: ["board"],
        body: {
          widgets: [
            { says: "Waiting", component: { $ref: "COUNT" }, gathers },
            { says: "A board within", argument: [{ $ref: "y" }], span: 2 },
            { says: "One, counted", component: { $ref: "COUNT" }, argument: [{ $ref: "z" }], span: 7 },
          ],
        },
      },
      kind: "full",
    } as unknown as Given<never>,
    space,
  )) as HTMLElement;

  expect([...drawn.querySelectorAll(".widget h2")].map((title) => title.textContent)).toEqual([
    "Waiting",
    "A board within",
    "One, counted",
  ]);
  expect(drawn.querySelector(".widget.span-2")).not.toBeNull();
  expect(opened).toEqual([
    { where: { gather: gathers }, opening: { kind: "face", component: "COUNT" } },
    { where: "y", opening: { kind: "full" } },
    { where: ["z"], opening: { kind: "face", component: "COUNT" } },
  ]);
  expect(drawn.querySelectorAll(".widget.span-3")).toHaveLength(1);
});
