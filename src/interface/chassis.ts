// The chassis is the page itself, and decides nothing. It starts the engine on its
// own thread, attaches the stores the page names, and hands the interface its root.
// Which components draw, and what, is all field data.

import { connect } from "./connection.ts";
import { note } from "./drawing.ts";
import { mount } from "./interface.ts";

const page = document.getElementById("glass")!;
const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));

// The stores the page ships with, as "key=url key=url", and any the address adds.
const stores = (document.documentElement.dataset.stores ?? "").split(/\s+/).filter(Boolean);
const added = new URL(location.href).searchParams.getAll("attach");

try {
  for (const store of [...stores, ...added]) {
    const [key, url] = store.split("=");
    await engine.attach(key!, url!);
  }

  await mount(engine, page);
} catch (error) {
  page.replaceChildren(
    note(`Glass could not start: ${error instanceof Error ? error.message : String(error)}`),
  );
}
