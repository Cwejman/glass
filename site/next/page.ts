// The page's entry. It starts the engine and each store in a Worker of its own, mounts
// the stores, and hands the engine to the interface to draw the entry.
//
// The site's stores are listed here, in its code. Published stores are read-only: their
// pages are fetched from the site and kept in OPFS. The home is the reader's own, kept
// only in this browser, and the one store written to.

import type { Engine } from "../../engine/next/engine.ts";
import { draw } from "../../interface/next/draw.ts";
import { note } from "../../interface/drawing.ts";
import { workers } from "../../runtime/runtime.ts";
import type { Store } from "../../stores/store.ts";

const page = document.getElementById("glass")!;

// Built next to the page from engine/next/browser.ts and stores/strata/browser.ts.
const engineCode = new URL("./engine.js", import.meta.url);
const strataCode = new URL("./strata.js", import.meta.url);

const published = (name: string) => ({ name, served: new URL(`./stores/${name}/`, location.href).href });

try {
  const runtime = workers();
  const engine = await runtime.run<Engine>(engineCode);

  for (const name of ["main", "glass", "paper", "paper-readings"])
    await engine.mount(name, await runtime.run<Store>(strataCode, published(name)));

  await engine.mount("home", await runtime.run<Store>(strataCode, { name: "home" }), { write: true });

  draw(engine, page, "@glass:entry");
} catch (problem) {
  page.replaceChildren(
    note(`Glass could not start: ${problem instanceof Error ? problem.message : problem}`),
  );
}
