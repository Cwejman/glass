import type { Id } from "../store/id.ts";
import type { HolonRead } from "../engine/engine.ts";
import type { Connection } from "./connection.ts";

// Every material in the field laid on the page, and laid again when it
// changes, so everything drawn is made of what the field says.

export async function lay(engine: Connection) {
  const materialType = (await engine.read({ name: "material" })) as Id | null;
  if (!materialType) return;
  for (const id of (await engine.read({ instances: materialType })) as Id[]) {
    const style = document.createElement("style");
    style.dataset.material = id;
    document.head.prepend(style);
    const laid = (material: HolonRead | null) => {
      style.textContent = material ? String(material.body.css ?? "") : "";
    };
    laid((await engine.subscribeHolon(id, laid)).value);
  }
}
