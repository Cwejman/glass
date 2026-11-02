import { Connection } from "./connection.ts";
import { Interface } from "./interface.ts";

// The chassis is the page itself, and decides nothing. It starts the engine on
// its own thread, attaches the store the page names, and hands the interface
// its root. Which components draw, and what, is all field data.

const page = document.documentElement.dataset;
const engine = new Connection(new Worker(new URL("./worker.js", import.meta.url), { type: "module" }));

try {
  await engine.attach("glass", page.store ?? "./store/");
  await new Interface(engine, document.getElementById("glass")!).boot();
} catch (error) {
  const failed = document.createElement("p");
  failed.className = "glass-note";
  failed.textContent = `Glass could not start: ${error instanceof Error ? error.message : String(error)}`;
  document.getElementById("glass")!.replaceChildren(failed);
}
