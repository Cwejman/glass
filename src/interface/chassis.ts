import { connect } from "./connection.ts";
import { note } from "./drawing.ts";
import { mount } from "./interface.ts";

// The chassis is the page itself, and decides nothing. It starts the engine on
// its own thread, attaches the store the page names, and hands the interface
// its root. Which components draw, and what, is all field data.

const page = document.documentElement.dataset;
const engine = connect(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));

try {
  await engine.attach("glass", page.store ?? "./store/");
  await mount(engine, document.getElementById("glass")!);
} catch (error) {
  const said = error instanceof Error ? error.message : String(error);
  document.getElementById("glass")!.replaceChildren(note(`Glass could not start: ${said}`));
}
