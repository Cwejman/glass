// The page's entry, on the engine. It starts the engine and each store in a Worker of
// its own, mounts the stores, finds what glass ships for it, and draws its root read,
// written in the language: Reader, given the text typed into the query. The query is a
// buffer, holding only the present, kept as one with the address, ?q= (address.ts).
//
// The site's stores are listed here, in its code. Published stores are read-only: their
// pages are fetched from the site and kept in OPFS. The home is the reader's own, kept
// only in this browser; it and the query are the stores written to.

import type { Engine, Read } from "../engine/engine.ts";
import { addressed } from "../interface/web/address.ts";
import { applying, found } from "../interface/web/carried.ts";
import { draw, note } from "../interface/web/chassis.ts";
import { finder } from "../interface/web/find.ts";
import { inspecting } from "../interface/web/inspector.tsx";
import { realizedIn } from "../interface/web/realized.ts";
import { workers } from "../runtime/runtime.ts";
import { begun } from "../stores/buffer/string.ts";
import type { Store } from "../stores/store.ts";

const page = document.getElementById("glass")!;

// An answer slow to come shows the page working, as does the page while it opens.
let awaited = 0;
document.addEventListener("busy", (event) => {
  awaited = Math.max(0, awaited + ((event as CustomEvent<boolean>).detail ? 1 : -1));
  document.body.classList.toggle("busy", awaited > 0);
});

// Each started from its own file; the build writes each beside the page.
const engineCode = new URL("../engine/browser.ts", import.meta.url);
const strataCode = new URL("../stores/strata/browser.ts", import.meta.url);
const bufferCode = new URL("../stores/buffer/browser.ts", import.meta.url);

// What the page draws: Reader, given the text the query holds.
const root = 'Reader(get(@query:text, "text"))';

const published = (name: string) => ({
  folder: name,
  from: new URL(`./strata/${name}/`, location.href).href,
});

try {
  const runtime = workers();
  const engine = await runtime.run<Engine>(engineCode);

  for (const name of ["glass", "wiki", "author", "paper", "paper-readings"])
    await engine.mount(name, await runtime.run<Store>(strataCode, published(name)));

  await engine.mount("home", await runtime.run<Store>(strataCode, { folder: "home" }), { write: true });

  const glass = await found((read) => engine.read(read));

  await engine.mount("query", await runtime.run<Store>(bufferCode), { write: true });
  const query = await engine.commit(begun("query", glass));
  if (!("ids" in query)) throw new Error(`the query was not begun: ${JSON.stringify(query)}`);

  const text = query.ids["~2"]!;
  await addressed(engine, glass, text, document.body);

  const read = await engine.read(applying(glass, "parse", root));
  if (!("value" in read)) throw new Error(`the page's read does not read: ${read.problem}`);

  const realized = realizedIn(glass);
  await draw(page, read.value as unknown as Read, {
    engine,
    glass,
    realized,
    find: finder((read) => engine.read(read), glass, [...realized.keys()]),
  });
  inspecting(page, { engine, glass, root: read.value as unknown as Read });
} catch (problem) {
  page.replaceChildren(note(problem instanceof Error ? problem.message : String(problem)));
} finally {
  document.body.classList.remove("opening");
}
