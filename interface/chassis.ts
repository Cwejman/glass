// The chassis is the page itself, and decides nothing. It starts the engine on its
// own thread, attaches the site's store the page names, and from that store's start the
// stores it offers, each to be read and each found from where the site's store is, and
// any the address adds; then it hands the interface the entry the start names, saying
// what it attached. The entry reaches
// everything else by reference. Which components draw, and what, is all field data.

import { connect } from "./connection.ts";
import { note } from "./drawing.ts";
import { mount } from "./interface.ts";

const page = document.getElementById("glass")!;
const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));

type Ref = { $ref: string };

// A store as the page says it, "key=url", the address as it is past the first "=".
const said = (store: string) => {
  const at = store.indexOf("=");
  return { key: store.slice(0, at), from: store.slice(at + 1) };
};

const site = said(document.documentElement.dataset.site ?? "");
const added = new URL(location.href).searchParams.getAll("attach").map(said);

try {
  if (!site.key || !site.from) throw new Error("the page names no site to start from");

  await engine.attach(site.key, site.from);

  const [startId] = await engine.read({ named: "start", store: site.key });
  const start = startId ? await engine.holon(startId) : null;
  if (!start) throw new Error(`the store ${site.key} has no start`);

  // What the start offers, each address read from where the site's store is.
  const siteAt = new URL(site.from, location.href);
  const offers = (Array.isArray(start.body.attachments) ? start.body.attachments : []) as unknown[];
  const offered = offers.map((offer) => {
    const { key, from } = (offer ?? {}) as { key?: unknown; from?: unknown };
    if (typeof key !== "string" || typeof from !== "string")
      throw new Error(`the start of ${site.key} offers a store it does not name and place`);

    return { key, from: new URL(from, siteAt).href };
  });

  // A store attached once, the first time it is named.
  const attached = [site, ...offered, ...added].filter(
    ({ key }, i, all) => all.findIndex((other) => other.key === key) === i,
  );

  for (const { key, from } of attached.slice(1)) await engine.attach(key, from);

  const entry = (start.body.entry as Ref | undefined)?.$ref;
  if (!entry) throw new Error(`the start of ${site.key} names no entry`);

  await mount(engine, page, { entry, attached });
} catch (error) {
  page.replaceChildren(
    note(`Glass could not start: ${error instanceof Error ? error.message : String(error)}`),
  );
}
