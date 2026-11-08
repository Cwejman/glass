// The interface as a reader meets it: the real components and the real stores, in a
// page of its own, with the home held in memory across reloads.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { startEngine, type Engine } from "../engine/engine.ts";
import type { HolonRead, Read } from "../engine/reads.ts";
import { memoryFiles } from "../store/files.ts";
import { openStore } from "../store/store.ts";
import { folderFiles, storeFolders } from "../tools/stores.ts";
import type { Component } from "./component.ts";
import type { Connection } from "./connection.ts";
import { mount } from "./interface.ts";

beforeAll(() => {
  if (!globalThis.document) GlobalRegistrator.register({ url: "https://glass.test/" });
});

const glassBrief = "1M6YBY3G00010TX";
const primitives = "1M6YBY3G00011HF";

// The engine, spoken to directly, as the worker would answer.
function connected(engine: Engine): Connection {
  return {
    attach: async () => null,
    read: engine.read,
    holon: (id: string) => engine.read({ holon: id }),
    commit: engine.commit,

    async subscribe<R extends Read>(query: R, listener: (value: any) => void) {
      let last = JSON.stringify(await engine.read(query));

      const stop = engine.onChange(() => {
        void engine.read(query).then((value) => {
          const text = JSON.stringify(value);
          if (text === last) return;

          last = text;
          listener(value);
        });
      });

      return { value: JSON.parse(last), close: stop };
    },
  } as unknown as Connection;
}

const componentFiles: Record<string, string> = {
  Brief: "brief",
  Holon: "holon",
  List: "list",
  Collection: "collection",
  Mount: "mount",
  Search: "search",
  Type: "type",
};

const load = (component: HolonRead) =>
  import(
    join(import.meta.dir, `../field/components/${componentFiles[component.name!]}.tsx`)
  ) as Promise<Component>;

const settled = async (test: () => unknown, within = 4000) => {
  const start = performance.now();

  while (!test()) {
    if (performance.now() - start > within) throw new Error("it did not settle");
    await Bun.sleep(10);
  }
};

const stores = await Promise.all(
  Object.entries(storeFolders()).map(async ([key, dir]) => [key, await openStore(folderFiles(dir))] as const),
);

async function open(address: string, homeFiles = memoryFiles()) {
  history.replaceState(null, "", address);

  const engine = startEngine(await openStore(homeFiles));

  for (const [key, store] of stores) await engine.attach(key, store);

  const page = document.createElement("main");
  document.body.replaceChildren(page);

  await mount(connected(engine), page, load);

  return { page, engine, homeFiles };
}

const heading = (page: HTMLElement) => page.querySelector(".reader h1")?.textContent;

const press = (element: Element) =>
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

const faceNamed = (page: HTMLElement, name: string) =>
  [...page.querySelectorAll(".slot.face")].find((face) => face.textContent?.includes(name));

const backTo = (address: string) => {
  history.replaceState(null, "", address);
  dispatchEvent(new PopStateEvent("popstate"));
};

afterEach(() => document.body.replaceChildren());

describe("reading", () => {
  test("a bare address opens the entry, and the address comes to say so", async () => {
    const { page } = await open("https://glass.test/");

    await settled(() => heading(page) === "Glass");

    expect(location.search).toBe(`?look=@${glassBrief}`);
    expect(page.querySelectorAll(".reader p").length).toBeGreaterThan(5);
    expect(faceNamed(page, "The primitives")).toBeTruthy();
  });

  test("an address that cannot be read falls back to the entry", async () => {
    const { page } = await open("https://glass.test/?look=Nonsense(((");

    await settled(() => heading(page) === "Glass");
  });

  test("a brief reads its sections through, under their names", async () => {
    const { page } = await open(`https://glass.test/?look=@${primitives}`);

    await settled(() => heading(page) === "The primitives");

    expect([...page.querySelectorAll(".reader section h2")].map((h2) => h2.textContent?.trim())).toContain(
      "Holon",
    );
  });

  test("the way down arrives after the words", async () => {
    const { page } = await open(`https://glass.test/?look=@${primitives}`);

    await settled(() => page.querySelector("nav a"));

    expect([...page.querySelectorAll("nav a")].map((a) => a.textContent)).toEqual(["The wiki", "Glass"]);
  });

  test("a way of looking lists what it gathers, in collections that open", async () => {
    const { page } = await open("https://glass.test/?look=Group+by(Everything,:store)");

    await settled(() => faceNamed(page, "holons"));
    await settled(() => faceNamed(page, "main"));

    const main = faceNamed(page, "main")!;

    expect(main.textContent).toContain("holons");

    press(main);
    await settled(() => location.search.includes("Store(:main)"));
  });

  test("a type draws its fields and instances", async () => {
    const { page } = await open("https://glass.test/?look=@1M6YBY3G000000X");

    await settled(() => page.querySelector(".type h1"));

    expect(page.querySelector(".type h1")?.textContent).toBe("brief");
    expect(page.querySelector(".type-fields")?.textContent).toContain("parts");
  });

  test("any other holon is drawn by the wildcard, with what it holds", async () => {
    const { page } = await open("https://glass.test/?look=@1M6YBY3G0001XEJ");

    await settled(() => page.querySelector(".holon h1"));

    expect(page.querySelector(".holon .values")?.textContent).toContain("paths");
  });
});

describe("moving", () => {
  test("a press on a face moves, and going back is only the address changing", async () => {
    const { page, engine } = await open(`https://glass.test/?look=@${glassBrief}`);
    const first = location.href;

    await settled(() => faceNamed(page, "The primitives"));
    press(faceNamed(page, "The primitives")!);

    await settled(() => heading(page) === "The primitives");
    expect(location.search).toBe(`?look=@${primitives}`);

    const [history_] = await settledHistory(engine);
    expect(history_).toBeTruthy();

    backTo(first);
    await settled(() => heading(page) === "Glass");
  });

  test("a press on words moves nowhere", async () => {
    const { page } = await open(`https://glass.test/?look=@${primitives}`);
    const before = location.href;

    await settled(() => heading(page));
    press(page.querySelector(".reader p")!);
    await Bun.sleep(50);

    expect(location.href).toBe(before);
  });

  test("a press where one already stands keeps the component one chose", async () => {
    const first = await open("https://glass.test/?look=@1M6YBY3G0001XEJ");
    await settled(() => first.page.querySelector(".holon h1"));

    const [wildcard] = await first.engine.read({ named: "Holon", store: "glass" });
    const address = `https://glass.test/?look=@${primitives}&with=${wildcard}`;
    const { page } = await open(address);

    await settled(() => page.querySelector(".holon h1"));
    press(page.querySelector(".holon h1")!);
    await Bun.sleep(50);

    expect(location.href).toBe(address);
  });

  test("each move is a visit, kept in the reader's history", async () => {
    const { page, engine } = await open(`https://glass.test/?look=@${glassBrief}`);

    await settled(() => faceNamed(page, "The grounds"));
    press(faceNamed(page, "The grounds")!);
    await settled(() => heading(page) === "The grounds");

    const [id] = await settledHistory(engine);
    const held = await engine.read({ holon: id! });

    expect(held?.store).toBe("home");
    expect((held?.body.visits as { looked: string }[]).at(-1)?.looked).toContain("@");
  });
});

async function settledHistory(engine: Engine) {
  const [type] = await engine.read({ named: "history", store: "glass" });

  for (let i = 0; i < 100; i++) {
    const held = await engine.read({ instances: type!, store: "home" });
    if (held.length) return held;

    await Bun.sleep(10);
  }

  return [];
}

describe("the search", () => {
  const input = (page: HTMLElement) => page.querySelector<HTMLInputElement>(".search-input")!;

  const type = (page: HTMLElement, text: string) => {
    input(page).value = text;
    input(page).dispatchEvent(new Event("input", { bubbles: true }));
  };

  const row = (page: HTMLElement, text: string) =>
    [...page.querySelectorAll(".search-found .found")].find((found) =>
      found.querySelector(".found-label")?.textContent?.startsWith(text),
    );

  const take = async (page: HTMLElement, text: string) => {
    await settled(() => row(page, text));
    press(row(page, text)!.querySelector("button")!);
  };

  test("it says where one stands, by what it is and what it is called", async () => {
    const { page } = await open(`https://glass.test/?look=@${primitives}`);

    await settled(() => page.querySelector(".search .part"));

    expect(page.querySelector(".search-field")?.textContent).toContain("brief");
    expect(page.querySelector(".search-field")?.textContent).toContain("The primitives");
  });

  test("typing a name finds it, and pressing goes there", async () => {
    const { page } = await open(`https://glass.test/?look=@${glassBrief}`);

    await settled(() => input(page));
    type(page, "primitives");

    await take(page, "The primitives");
    await settled(() => heading(page) === "The primitives");
  });

  test("words are offered as Text, gathering what says them", async () => {
    const { page } = await open(`https://glass.test/?look=@${glassBrief}`);

    await settled(() => input(page));
    type(page, "mount reader");

    await take(page, "Text: mount reader");
    await settled(() => location.search.includes("Text(:mount+reader)"));
    await settled(() => page.querySelector(".list li"));
  });

  test("a brick is built as it reads, what it takes chosen in turn", async () => {
    const { page } = await open(`https://glass.test/?look=@${glassBrief}`);

    await settled(() => row(page, "Not"));
    await take(page, "Not");

    await settled(() => page.querySelector(".part.pending")?.textContent === "Not");

    type(page, "Is a type");
    await take(page, "Is a type");

    await settled(
      () =>
        decodeURIComponent(location.search).includes("Not(Is a type)") ||
        location.search.includes("Not(Is+a+type)"),
    );
  });

  test("a part is let go with its ×, and all let go is everything", async () => {
    const { page } = await open("https://glass.test/?look=Group+by(Everything,:store)");

    await settled(() => page.querySelector(".let-go"));
    press(page.querySelector(".let-go")!);

    await settled(() => page.querySelector(".let-go") === null || location.search.includes("Everything"));
  });

  test("laid where something was pressed, it says the place and lets go of nothing", async () => {
    const { page } = await open("https://glass.test/?look=Group+by(Everything,:store)");

    await settled(() => page.querySelector(".list"));

    page
      .querySelector(".list")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

    await settled(() => page.querySelector(".menu .search"));
    await settled(() => row(page.querySelector(".menu") as HTMLElement, "Look here"));

    expect(page.querySelector(".menu .let-go")).toBe(null);
  });
});

describe("the home", () => {
  async function keepAFavorite(page: HTMLElement) {
    await settled(() => page.querySelector(".section-link"));

    page
      .querySelector(".section-link")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

    await settled(() =>
      [...page.querySelectorAll(".menu .found")].find((found) => found.textContent?.includes("favorites")),
    );

    const row = [...page.querySelectorAll(".menu .found")].find((found) =>
      found.textContent?.includes("favorites"),
    )!;

    press(row.querySelector("button") ?? row);
  }

  test("what the reader keeps becomes their own root, and survives a reload", async () => {
    const first = await open(`https://glass.test/?look=@${primitives}`);

    await keepAFavorite(first.page);

    for (let i = 0; i < 200 && !(await first.engine.read({ named: "root", store: "home" })).length; i++)
      await Bun.sleep(10);

    const [root] = await first.engine.read({ named: "root", store: "home" });
    const held = await first.engine.read({ holon: root! });

    expect(held?.store).toBe("home");
    expect((held?.body.offer as { favorites: unknown[] }).favorites.length).toBe(1);

    const again = await open(`https://glass.test/?look=@${primitives}`, first.homeFiles);

    await settled(() => heading(again.page) === "The primitives");

    expect(await again.engine.read({ named: "root", store: "home" })).toEqual([root!]);
    expect(
      ((await again.engine.read({ holon: root! }))?.body.offer as { favorites: unknown[] }).favorites.length,
    ).toBe(1);
  });

  test("the store it reads from is never written", async () => {
    const heads = stores.map(([, store]) => store.head);
    const { page } = await open(`https://glass.test/?look=@${primitives}`);

    await keepAFavorite(page);
    await Bun.sleep(50);

    expect(await Promise.all(stores.map(async ([, store]) => (await openStore(store.files)).head))).toEqual(
      heads,
    );
  });
});
