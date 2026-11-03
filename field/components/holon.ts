import type { Id } from "../../src/store/id.ts";
import type { Given, Space } from "../../src/interface/interface.ts";
import { element } from "./prose.ts";

// Any holon, when nothing closer draws it: what it is an instance of, and its
// body as the JSON it is, code shown as code.

export const style = `
.holon-whole h1 { font-size: var(--title); line-height: var(--leading-tight); margin: 0 0 0.25em; }
.holon-whole .instance, .holon-face .instance { font: var(--small) / var(--leading-close) var(--sans); color: var(--quiet); }
.holon-whole pre { background: var(--raised); border: var(--hairline) solid var(--line); border-radius: var(--radius); padding: var(--inset);
  overflow-x: auto; font-size: var(--code); line-height: var(--leading-close); }
.holon-face { padding: var(--gap); border: var(--hairline) solid var(--line); border-radius: var(--radius); background: var(--raised); cursor: pointer; }
`;

export default async function draw({ holon, draws }: Given, space: Space) {
  const types = await Promise.all(holon.instance.map(async (id: Id) => (await space.holon(id))?.body.title ?? id));
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
