// The chassis is the page itself, and decides nothing. Where the page names an engine,
// as its host on this machine does, it mounts to that engine over a socket, which holds
// every store the host serves already. Otherwise it starts an engine of its own on its
// own thread, attaches the site's store the page names, and from that store's start the
// stores it offers, each found from where the site's store is, and any the address adds.
// Then it hands the interface the entry the start names, saying what is attached. The
// entry reaches everything else by reference. Which components draw is all field data.

import { connect, socketPort } from "./connection.ts";
import { note } from "./drawing.ts";
import { mount } from "./interface.ts";

const page = document.getElementById("glass")!;
const hosted = document.documentElement.dataset.engine;

// The host is asked each second whether it is back, and the page comes back with it.
const whenBack = () =>
  fetch(location.href, { method: "HEAD" }).then(
    ({ ok }) => (ok ? location.reload() : setTimeout(whenBack, 1000)),
    () => setTimeout(whenBack, 1000),
  );

// An engine lost after it answered, the page waits for it; one that never answered this
// page will not, so the page says so and waits for nothing.
function lost(opened: boolean) {
  if (!opened) {
    page.replaceChildren(
      note(`The engine here does not answer this page; open it at http://127.0.0.1:${location.port}/`),
    );
    return;
  }

  page.replaceChildren(note("The engine on this machine is gone; the page comes back when it does."));
  setTimeout(whenBack, 1000);
}

// The one choice the page makes: an engine its host holds, which has attached every store
// already and keeps the home, its addresses said as paths so the home reads the same by
// any name of this machine; or an engine of its own, which attaches what the page names.
const engine = connect(
  hosted
    ? socketPort(new URL(hosted, location.href.replace(/^http/, "ws")).href, lost)
    : new Worker(new URL("./worker.js", import.meta.url), { type: "module" }),
);
const attach = hosted ? async () => undefined : engine.attach;
const addressOf = (url: URL) => (hosted ? url.pathname : url.href);

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

  if (hosted && added.length)
    throw new Error("the engine on this machine holds only the stores its host serves");
  await attach(site.key, site.from);

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

    return { key, from: addressOf(new URL(from, siteAt)) };
  });

  // A store attached once, the first time it is named.
  const attached = [site, ...offered, ...added].filter(
    ({ key }, i, all) => all.findIndex((other) => other.key === key) === i,
  );

  for (const { key, from } of attached.slice(1)) await attach(key, from);

  const entry = (start.body.entry as Ref | undefined)?.$ref;
  if (!entry) throw new Error(`the start of ${site.key} names no entry`);

  await mount(engine, page, { entry, attached });
} catch (error) {
  page.replaceChildren(
    note(`Glass could not start: ${error instanceof Error ? error.message : String(error)}`),
  );
}
