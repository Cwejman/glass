// The page's entry, on the new engine. It starts the engine and each store in a Worker of
// its own, mounts the stores, finds what glass ships for it, and draws its root read,
// written in the language: Reader, given the text typed into the query. The query is a
// buffer, holding only the present, kept as one with the address, ?q= (address.ts).
//
// The site's stores are listed here, in its code. Published stores are read-only: their
// pages are fetched from the site and kept in OPFS. The home is the reader's own, kept
// only in this browser; it and the query are the stores written to.

import type { Engine, Read } from "../../engine/next/engine.ts";
import { addressed } from "../../interface/web/address.ts";
import { applying, found } from "../../interface/web/carried.ts";
import { draw, note } from "../../interface/web/chassis.ts";
import { finder } from "../../interface/web/find.ts";
import { realizedIn } from "../../interface/web/realized.ts";
import { workers } from "../../runtime/runtime.ts";
import { begun } from "../../stores/buffer/string.ts";
import type { Store } from "../../stores/store.ts";

const page = document.getElementById("glass")!;

// Each started from its own file; the build writes each beside the page.
const engineCode = new URL("../../engine/next/browser.ts", import.meta.url);
const strataCode = new URL("../../stores/strata/browser.ts", import.meta.url);
const bufferCode = new URL("../../stores/buffer/browser.ts", import.meta.url);

// What the page draws: Reader, given the text the query holds.
const root = 'Reader(get(@query:text, "text"))';

const published = (name: string) => ({
  folder: name,
  from: new URL(`./strata/${name}/`, location.href).href,
});

try {
  const runtime = workers();
  const engine = await runtime.run<Engine>(engineCode);

  for (const name of ["main", "glass", "paper", "paper-readings"])
    await engine.mount(name, await runtime.run<Store>(strataCode, published(name)));

  await engine.mount("home", await runtime.run<Store>(strataCode, { folder: "home" }), { write: true });

  const glass = await found((read) => engine.read(read));

  await engine.mount("query", await runtime.run<Store>(bufferCode), { write: true });
  const query = await engine.commit(begun("query", glass));
  if (!("ids" in query)) throw new Error(`the query was not begun: ${JSON.stringify(query)}`);

  const text = query.ids["~2"]!;
  await addressed(engine, glass, text, page);

  const read = await engine.read(applying(glass, "parse", root));
  if (!("value" in read)) throw new Error(`the page's read does not read: ${read.problem}`);

  const realized = realizedIn(glass);
  await draw(page, read.value as unknown as Read, {
    engine,
    glass,
    realized,
    find: finder((read) => engine.read(read), glass, [...realized.keys()], glass.Value),
  });
} catch (problem) {
  page.replaceChildren(note(problem instanceof Error ? problem.message : String(problem)));
}
