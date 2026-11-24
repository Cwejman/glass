// The page's entry, on the engine. It starts the engine and each store in a Worker of
// its own, mounts the stores, finds what glass ships for it, puts the chassis and the
// components realized on the web together, and draws its root read,
// written in the language: Reader, given the text typed into the query. The query is a
// buffer, holding only the present, kept as one with the address, ?q= (address.ts).
//
// The site's stores are listed here, in its code. Published stores are read-only: their
// blobs are fetched from the site, each store's whole once it opens, and kept in OPFS.
// The home is the reader's own, kept only in this browser; it and the query are the
// stores written to.

import type { Engine, Read } from "../engine/engine.ts";
import { addressed } from "./address.ts";
import { askingByKey } from "../components/web/asking.ts";
import { applying, found } from "../language/shipped.ts";
import { draw } from "../chassis/web/chassis.ts";
import { working } from "./busy.ts";
import { inspecting } from "./inspector.tsx";
import { webComponents } from "../components/web/realized.ts";
import { workers } from "../runtime/runtime.ts";
import { begun } from "../stores/buffer/string.ts";
import type { Store } from "../stores/store.ts";

const page = document.getElementById("glass")!;

// Each started from its own file; the build writes each beside the page.
const engineCode = new URL("../engine/browser.ts", import.meta.url);
const strataCode = new URL("../stores/strata/browser.ts", import.meta.url);
const bufferCode = new URL("../stores/buffer/browser.ts", import.meta.url);

// What the page draws: Reader, given the text the query holds.
const root = 'Reader(get(@query:text, "text"))';

// Each kept whole: once opened, what it holds is fetched in the background, its index first
// and then its commits from the newest back, behind any read waiting, so moving within the
// field soon waits on nothing fetched.
const published = (name: string) => ({
  folder: name,
  from: new URL(`./strata/${name}/`, location.href).href,
  whole: true,
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

  // The chassis, given the components on the web.
  const components = await webComponents((read) => engine.read(read));
  // What the page shows waiting on reads shows the page working.
  let done = () => {};
  const reading = (busy: boolean) => (busy ? (done = working()) : done());
  await draw(page, read.value as unknown as Read, { engine, glass, ...components, reading });
  inspecting(page, { engine, glass, root: read.value as unknown as Read, names: components.names });
  askingByKey(document);
} catch (problem) {
  // The page could not be opened: said as a line, there being no chassis to draw it.
  const said = document.createElement("p");
  said.className = "note";
  said.textContent = problem instanceof Error ? problem.message : String(problem);
  page.replaceChildren(said);
} finally {
  document.body.classList.remove("opening");
}
