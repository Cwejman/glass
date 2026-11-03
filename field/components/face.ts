import type { Given, Space } from "../../src/interface/component.ts";
import { element } from "./element.ts";
import { faceOf } from "./prose.ts";
import { card, follow } from "./way.ts";

// A brief seen from above: its number, its title and its first paragraph,
// which is its face, and how many briefs stand beneath it. Pressing it
// places the reader there.

export const style = `
.face-card h2 {
  font-size: var(--heading);
  line-height: var(--leading-tight);
  margin: 0 0 0.35em;
  font-weight: 600;
}

.face-card h2 .number {
  color: var(--quiet);
  font-weight: 400;
  margin-right: 0.45em;
}

.face-card p {
  margin: 0;
  color: var(--quiet);
  font-size: var(--aside);
  line-height: var(--leading-close);
}
`;

export default function draw(given: Given, space: Space) {
  const holon = given.holon!;
  const number = (given.with as { number?: string } | null)?.number;
  const face = card(holon.id);
  face.classList.add("face-card");

  const title = element("h2");
  if (number) title.append(element("span", "number", number));
  title.append(String(holon.body.title ?? ""));
  face.append(title);

  const first = faceOf(String(holon.body.prose ?? ""));
  if (first) {
    const paragraph = element("p");
    paragraph.innerHTML = first;
    face.append(paragraph);
  }

  const beneath = ((holon.body.parts ?? []) as unknown[]).length;
  if (beneath) face.append(element("span", "meta", `${beneath} beneath`));

  follow(face, space);
  return face;
}
