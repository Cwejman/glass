// The page's entry, on the engine. It starts the engine and each store in a Worker of
// its own, mounts the stores, finds what glass ships for it, gives the chassis the
// components the field realizes on the web, and draws its root read,
// written in the language: Reader, given what the address asks, its param q, as the
// location projects it (integrations/location/location.ts).
//
// The site's stores are listed here, in its code. Published stores are read-only: their
// blobs are fetched from the site, each store's whole once it opens, and kept in OPFS.
// The home is the reader's own, kept only in this browser; it and the location are the
// stores written to.

import type { Engine, Read } from "../engine/engine.ts";

import { askingByKey } from "../components/web/asking.ts";
import { applying, found } from "../language/shipped.ts";
import { draw } from "../chassis/web/chassis.ts";
import { working } from "./busy.ts";
import { inspecting } from "./inspector.tsx";
import { realizedOn } from "../chassis/web/realized.ts";
import { sameThread, workers } from "../runtime/runtime.ts";
import { portChannel } from "../wire/port.ts";
import { objectServedOn, serveObject } from "../wire/wire.ts";
import type { Store } from "../stores/store.ts";

const page = document.getElementById("glass")!;

// Each started from its own file; the build writes each beside the page.
const engineCode = new URL("../engine/browser.ts", import.meta.url);
const strataCode = new URL("../stores/strata/browser.ts", import.meta.url);
const locationCode = new URL("../integrations/location/browser.ts", import.meta.url);

// What the page draws: Reader, given what the address asks.
const root = 'Reader(get(@location:params, "q"))';

// Each kept whole: once opened, what it holds is fetched in the background, its index first
// and then its commits from the newest back, behind any read waiting, so moving within the
// field soon waits on nothing fetched.
const published = (name: string) => ({
  folder: name,
  from: new URL(`/strata/${name}/`, location.origin).href,
  whole: true,
});

try {
  const runtime = workers();
  const engine = await runtime.run<Engine>(engineCode);

  for (const name of ["glass", "components", "wiki", "author", "paper", "paper-readings"])
    await engine.mount(name, await runtime.run<Store>(strataCode, published(name)));

  await engine.mount("home", await runtime.run<Store>(strataCode, { folder: "home" }), { write: true });

  const glass = await found((read) => engine.read(read));

  // The browser's address and history, projected by the location on the page's own
  // thread, where they are, and served to the engine over the wire. It takes every path
  // of the origin, as a single-page app: the site serves this page at each.
  const { port1, port2 } = new MessageChannel();
  serveObject(portChannel(port2), await sameThread().run<Store>(locationCode, { scope: "origin" }));
  await engine.mount("location", objectServedOn<Store>(portChannel(port1)), { write: true });

  // The tab says what is asked.
  const asked = await engine.read(applying(glass, "parse", 'get(@location:params, "q")'));
  if (!("value" in asked)) throw new Error(asked.problem);
  await engine.subscribe(asked.value as unknown as Read, (answer) => {
    const asking = "value" in answer && typeof answer.value === "string" ? answer.value : "";
    document.title = asking ? `${asking} · Glass` : "Glass";
  });

  const read = await engine.read(applying(glass, "parse", root));
  if (!("value" in read)) throw new Error(`the page's read does not read: ${read.problem}`);

  // The chassis, given the components the field realizes on the web, each loaded as built
  // at its path (build.ts), and those it draws for its own cases.
  const components = await realizedOn(
    (read) => engine.read(read),
    glass,
    "web",
    (path) => import(`/${path.replace(/\.tsx?$/, ".js")}`).then((module) => module.default),
    { choose: "components:Choose", fallback: "components:Value", problem: "components:Problem" },
  );
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
