// The chassis is the page itself, and decides nothing. It starts the engine on its
// own thread, attaches the stores the page names, and hands the interface the entry the
// page names, saying what it attached. The entry reaches everything else by reference.
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
  const attached = [...stores, ...added].map((store) => {
    const [key, from] = store.split("=");
    return { key: key!, from: from! };
  });

  for (const { key, from } of attached) await engine.attach(key, from);

  const entry = document.documentElement.dataset.entry;
  if (!entry) throw new Error("the page names no entry to boot into");

  await mount(engine, page, { entry, attached });
} catch (error) {
  page.replaceChildren(
    note(`Glass could not start: ${error instanceof Error ? error.message : String(error)}`),
  );
}
