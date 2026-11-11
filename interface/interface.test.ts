import { readdirSync } from "node:fs";
// The interface as a reader meets it: the real components and the real stores, in a
// page of its own, with the home held in memory across reloads.

import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { startEngine, type Engine } from "../engine/engine.ts";
import type { HolonRead, Read } from "../engine/reads.ts";
import { memoryFiles } from "../integrations/glass/files.ts";
import { openStore } from "../integrations/glass/store.ts";
import { openStores } from "../stores.ts";
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

// Each component module, by the name it declares, as the field makes them.
const componentDir = join(import.meta.dir, "../components");
const modules = new Map<string, string>();

for (const file of readdirSync(componentDir).filter(
  (name) => name.endsWith(".tsx") && !name.includes(".test."),
)) {
  const { declared } = await import(join(componentDir, file));
  if (declared) modules.set(declared.name, join(componentDir, file));
}

const load = (component: HolonRead) => import(modules.get(component.name!)!) as Promise<Component>;

const settled = async (test: () => unknown, within = 4000) => {
  const start = performance.now();

  while (!test()) {
    if (performance.now() - start > within) throw new Error("it did not settle");
    await Bun.sleep(10);
  }
};

const stores = Object.entries(await openStores());

async function open(address: string, homeFiles = memoryFiles(), servedAt = "./") {
  history.replaceState(null, "", address);

  const engine = startEngine([{ key: "home", store: await openStore(homeFiles), write: true }]);

  for (const [key, store] of stores) await engine.attach(key, store);

  const page = document.createElement("main");
  document.body.replaceChildren(page);

  const [entry] = await engine.read({ named: "entry", store: "glass" });

  await mount(connected(engine), page, {
    entry: entry!,
    load,
    attached: stores.map(([key]) => ({ key, from: `${servedAt}${key}/` })),
  });

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
  const storesShown = (page: HTMLElement) =>
    [...page.querySelectorAll(".card strong")].map((name) => name.textContent);

  test("a bare address opens the root, what is attached, and says nothing", async () => {
    const { page } = await open("https://glass.test/");

    await settled(() => storesShown(page).includes("main"));

    expect(location.search).toBe("");
    expect(storesShown(page)).toContain("glass");
    expect(page.querySelector(".reader p")).toBeNull();
  });

  test("what is attached is kept in the home once, and a store's face leads to its level", async () => {
    const { page, engine } = await open("https://glass.test/");

    await settled(() => storesShown(page).includes("main"));

    const [type] = await engine.read({ named: "attachment", store: "glass" });
    const kept = await engine.read({ instances: type!, store: "home" });

    expect(kept.length).toBe(stores.length);

    const main = [...page.querySelectorAll<HTMLElement>(".card")].find(
      (card) => card.querySelector("strong")?.textContent === "main",
    )!;
    main.click();

    await settled(() => location.search === "?look=store(%22main%22)");
    await settled(() => faceNamed(page, "The wiki"));
  });

  test("an attachment kept in the home is said again when where it comes from moves", async () => {
    const { page, homeFiles } = await open("https://glass.test/", memoryFiles(), "./store/");
    await settled(() => storesShown(page).includes("main"));

    const moved = await open("https://glass.test/", homeFiles, "./stores/");
    await settled(() => storesShown(moved.page).includes("main"));

    const [type] = await moved.engine.read({ named: "attachment", store: "glass" });
    const kept = await moved.engine.read({ instances: type!, store: "home" });
    const froms = await Promise.all(
      kept.map(
        async (id) =>
          ((await moved.engine.read({ holon: id })) as { body: { from?: string } } | null)?.body.from,
      ),
    );

    expect(kept.length).toBe(stores.length);
    expect(froms.sort()).toEqual(stores.map(([key]) => `./stores/${key}/`).sort());
  });

  test("letting go of the last part is the root again", async () => {
    const { page } = await open(`https://glass.test/?look=@${glassBrief}`);

    await settled(() => heading(page) === "Glass");
    page.querySelector<HTMLElement>(".part .let-go")!.click();

    await settled(() => location.search === "");
    await settled(() => storesShown(page).includes("main"));
  });

  test("a brief is opened by going to it", async () => {
    const { page } = await open(`https://glass.test/?look=@${glassBrief}`);

    await settled(() => heading(page) === "Glass");

    expect(page.querySelectorAll(".reader p").length).toBeGreaterThan(5);
    expect(faceNamed(page, "The primitives")).toBeTruthy();
  });

  test("an address that cannot be read falls back to the entry", async () => {
    const { page } = await open("https://glass.test/?look=nonsense(((");

    await settled(() => storesShown(page).includes("main"));
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
    const { page } = await open("https://glass.test/?look=group(everything(),%22store%22)");

    await settled(() => faceNamed(page, "holons"));
    await settled(() => faceNamed(page, "main"));

    const main = faceNamed(page, "main")!;

    expect(main.textContent).toContain("holons");

    press(main);
    await settled(() => location.search.includes("store(%22main%22)"));
  });

  test("a type draws its fields and instances", async () => {
    const { page } = await open("https://glass.test/?look=@1M6YBY3G000000X");

    await settled(() => page.querySelector(".type h1"));

    expect(page.querySelector(".type h1")?.textContent).toBe("brief");
    expect(page.querySelector(".type-fields")?.textContent).toContain("parts");
  });

  test("any other holon is drawn by the wildcard, with what it holds", async () => {
    const { page } = await open("https://glass.test/?look=@1M72V32949Z60AN");

    await settled(() => page.querySelector(".holon h1"));

    expect(page.querySelector(".holon .values")?.textContent).toContain("opens");
  });

  test("a session is read as it was had, what was said in order, by whose voice", async () => {
    const { page } = await open("https://glass.test/?look=@1M7360TVPDXC000");

    await settled(() => page.querySelector(".session .utterance header"));

    expect(page.querySelector(".session .utterance header")?.textContent).toContain("1.");
    expect(page.querySelector(".session .utterance header")?.textContent).toContain("The author");
  });
});

describe("moving", () => {
  test("an address by route lands where the route leads", async () => {
    const { page } = await open("https://glass.test/?place=main/The+wiki/Glass/The+primitives");

    await settled(() => heading(page) === "The primitives");
    expect(location.search).toBe(`?place=main/The+wiki/Glass/The+primitives&id=${primitives}`);
  });

  test("a press on a face moves to its route, and going back is only the address changing", async () => {
    const { page, engine } = await open(`https://glass.test/?look=@${glassBrief}`);
    const first = location.href;

    await settled(() => faceNamed(page, "The primitives"));
    press(faceNamed(page, "The primitives")!);

    await settled(() => heading(page) === "The primitives");
    expect(location.search).toBe(`?place=main/The+wiki/Glass/The+primitives&id=${primitives}`);

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
    const first = await open("https://glass.test/?look=@1M72V32949Z60AN");
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

  test("words are offered as a search, gathering what says them", async () => {
    const { page } = await open(`https://glass.test/?look=@${glassBrief}`);

    await settled(() => input(page));
    type(page, "mount reader");

    await take(page, "search: mount reader");
    await settled(() => location.search.includes("search(%22mount+reader%22)"));
    await settled(() => page.querySelector(".list li"));
  });

  test("words said in the language are a way of looking of their own", async () => {
    const { page } = await open(`https://glass.test/?look=@${glassBrief}`);

    await settled(() => input(page));
    type(page, "type(@types/brief) | level");

    await take(page, "type(@types/brief) | level");
    await settled(() => location.search.startsWith("?look=level(type(@"));
    await settled(() => page.querySelector(".list li"));
  });

  test("a brick is built as it reads, what it takes chosen in turn", async () => {
    const { page } = await open(`https://glass.test/?look=@${glassBrief}`);

    await settled(() => row(page, "not"));
    await take(page, "not");

    await settled(() => page.querySelector(".part.pending")?.textContent === "not");

    type(page, "types");
    await take(page, "types");

    await settled(() => location.search.includes("not(types())"));
  });

  test("a part is let go with its ×, and all let go is everything", async () => {
    const { page } = await open("https://glass.test/?look=group(everything(),%22store%22)");

    await settled(() => page.querySelector(".let-go"));
    press(page.querySelector(".let-go")!);

    await settled(() => page.querySelector(".let-go") === null || location.search.includes("everything()"));
  });

  test("laid where something was pressed, it says the place and lets go of nothing", async () => {
    const { page } = await open("https://glass.test/?look=group(everything(),%22store%22)");

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
