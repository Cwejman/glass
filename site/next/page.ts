// The page's entry, on the new engine. It starts the engine and each store in a Worker of
// its own, mounts the stores, and draws the answer to what the address asks, ?q=, read
// as text into uses.
//
// The site's stores are listed here, in its code. Published stores are read-only: their
// pages are fetched from the site and kept in OPFS. The home is the reader's own, kept
// only in this browser, and the one store written to.

import type { Engine } from "../../engine/next/engine.ts";
import { answerOf } from "../../interface/web/carried.ts";
import { draw, note } from "../../interface/web/chassis.ts";
import { finder } from "../../interface/web/find.ts";
import { fallback, realized } from "../../interface/web/realized.ts";
import { workers } from "../../runtime/runtime.ts";
import type { Store } from "../../stores/store.ts";

const page = document.getElementById("glass")!;

// Each started from its own file; the build writes each beside the page.
const engineCode = new URL("../../engine/next/browser.ts", import.meta.url);
const strataCode = new URL("../../stores/strata/browser.ts", import.meta.url);

const published = (name: string) => ({
  folder: name,
  from: new URL(`./strata/${name}/`, location.href).href,
});

const asked = new URL(location.href).searchParams.get("q")?.trim();

try {
  if (!asked) throw new Error("ask with ?q=, as ?q=@Knowledge");

  const runtime = workers();
  const engine = await runtime.run<Engine>(engineCode);

  for (const name of ["main", "glass", "paper", "paper-readings"])
    await engine.mount(name, await runtime.run<Store>(strataCode, published(name)));

  await engine.mount("home", await runtime.run<Store>(strataCode, { folder: "home" }), { write: true });

  document.title = `${asked} · Glass`;
  await draw(page, answerOf(asked), {
    engine,
    realized,
    find: finder((read) => engine.read(read), [...realized.keys()], fallback),
  });
} catch (problem) {
  page.replaceChildren(note(problem instanceof Error ? problem.message : String(problem)));
}
