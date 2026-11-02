import type { Given, Space } from "../../src/interface/interface.ts";
import { element, faceOf } from "./prose.ts";

// A brief seen from above: its number, its title and its first paragraph,
// which is its face. Entering it places the reader there.

export const style = `
.face-card { display: block; padding: 1rem 1.15rem; border: 1px solid var(--line); border-radius: 8px;
  background: var(--raised); cursor: pointer; transition: border-color .15s; }
.face-card:hover { border-color: var(--quiet); }
.face-card h2 { font-size: 1.1rem; line-height: 1.35; margin: 0 0 .35rem; font-weight: 600; }
.face-card h2 .number { color: var(--quiet); font-weight: 400; margin-right: .45em; }
.face-card p { margin: 0; color: var(--quiet); font-size: .93em; line-height: 1.55; }
.face-card .beneath { display: block; margin-top: .5rem; font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; color: var(--quiet); opacity: .8; }
`;

export default function draw({ holon, with: given }: Given, space: Space) {
  const card = element("div", "face-card");
  card.tabIndex = 0;
  const title = element("h2");
  const number = (given as { number?: string } | null)?.number;
  if (number) title.append(element("span", "number", number));
  title.append(String(holon.body.title ?? ""));
  card.append(title);

  const face = faceOf(String(holon.body.prose ?? ""));
  if (face) {
    const paragraph = element("p");
    paragraph.innerHTML = face;
    card.append(paragraph);
  }
  const beneath = ((holon.body.parts ?? []) as unknown[]).length;
  if (beneath) card.append(element("span", "beneath", `${beneath} beneath`));

  const enter = (event: Event) => {
    const link = (event.target as Element).closest<HTMLElement>("a[data-ref]");
    event.preventDefault();
    event.stopPropagation();
    void space.place(link?.dataset.ref ?? holon.id);
  };
  card.addEventListener("click", enter);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter") enter(event);
  });
  return card;
}
