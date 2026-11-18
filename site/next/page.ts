// The page's entry, on the new engine. It starts the engine and each store in a Worker of
// its own, mounts the stores, and draws the text typed into the query, and its answer,
// the text read into uses. The query is a buffer, holding only the present, kept as one
// with the address, ?q= (address.ts).
//
// The site's stores are listed here, in its code. Published stores are read-only: their
// pages are fetched from the site and kept in OPFS. The home is the reader's own, kept
// only in this browser; it and the query are the stores written to.

import type { Engine } from "../../engine/next/engine.ts";
import { addressed } from "../../interface/web/address.ts";
import { readerOf } from "../../interface/web/carried.ts";
import { draw, note } from "../../interface/web/chassis.ts";
import { finder } from "../../interface/web/find.ts";
import { fallback, listed, realized } from "../../interface/web/realized.ts";
import { workers } from "../../runtime/runtime.ts";
import { begun } from "../../stores/buffer/string.ts";
import type { Store } from "../../stores/store.ts";

const page = document.getElementById("glass")!;

// Each started from its own file; the build writes each beside the page.
const engineCode = new URL("../../engine/next/browser.ts", import.meta.url);
const strataCode = new URL("../../stores/strata/browser.ts", import.meta.url);
const bufferCode = new URL("../../stores/buffer/browser.ts", import.meta.url);

// The types a buffer's root and its shape are of, as glass holds them.
const types = { store: "1M75HB35AC75002", shape: "1M75HB35AC75000" };

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

  await engine.mount("query", await runtime.run<Store>(bufferCode), { write: true });
  const query = await engine.commit(begun("query", types));
  if (!("ids" in query)) throw new Error(`the query was not begun: ${JSON.stringify(query)}`);

  const text = query.ids["~2"]!;
  await addressed(engine, text, page);
  await draw(page, readerOf(text, listed), {
    engine,
    realized,
    find: finder((read) => engine.read(read), [...realized.keys()], fallback),
  });
} catch (problem) {
  page.replaceChildren(note(problem instanceof Error ? problem.message : String(problem)));
}
