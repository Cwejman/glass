import type { Id } from "../../src/store/id.ts";
import type { HolonRead } from "../../src/engine/engine.ts";
import type { Given, Space } from "../../src/interface/interface.ts";
import { element } from "./prose.ts";

// Any holon, when nothing closer draws it: what it is an instance of, and its
// body as the JSON it is, code shown as code.

export const style = `
.holon-whole h1 { font-size: 1.6rem; margin: 0 0 .5rem; }
.holon-whole .instance, .holon-face .instance { font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; color: var(--quiet); }
.holon-whole pre { background: var(--raised); border: 1px solid var(--line); border-radius: 6px; padding: .8rem 1rem;
  overflow-x: auto; font-size: .78em; line-height: 1.5; }
.holon-face { padding: .8rem 1rem; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
`;

export default async function draw({ holon, draws }: Given, space: Space) {
  const types = await Promise.all(
    holon.instance.map(async (id: Id) => ((await space.read({ holon: id })) as unknown as HolonRead | null)?.body.title ?? id),
  );
  const title = String(holon.body.title ?? holon.id);
  const instance = element("div", "instance", `${types.join(", ")} · ${holon.store}`);

  if (draws === "face") {
    const card = element("div", "holon-face");
    card.append(element("strong", undefined, title), instance);
    card.addEventListener("click", () => void space.place(holon.id));
    return card;
  }

  const whole = element("article", "holon-whole");
  whole.append(element("h1", undefined, title), instance);
  const { code, source, ...rest } = holon.body;
  whole.append(element("pre", undefined, JSON.stringify(rest, null, 2)));
  if (typeof source === "string") whole.append(element("pre", undefined, source));
  else if (typeof code === "string") whole.append(element("pre", undefined, code));
  return whole;
}
