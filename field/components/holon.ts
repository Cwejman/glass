import type { Json } from "../../src/store/canonical.ts";
import type { Id } from "../../src/store/id.ts";
import type { Given, Space } from "../../src/interface/component.ts";
import { element } from "./element.ts";
import { markdown } from "./prose.ts";
import { card, follow, way } from "./way.ts";

// Any holon, when nothing closer draws it: the wildcard. Whole, it is what
// the holon is an instance of, and every value in its body, a reference
// drawn as the face of what it points at, so everything in the field can be
// reached from anywhere; long text and code shown as they are. Seen from
// above, its title and its types.

export const style = `
.values {
  margin: 0;
  display: grid;
  gap: var(--gap);
}

.values dt {
  font: var(--small) / var(--leading-close) var(--mono);
  color: var(--quiet);
}

.values dd {
  margin: 0.25em 0 0;
}

.values ol {
  margin: 0;
  padding-left: 1.2em;
  display: grid;
  gap: calc(var(--gap) * 0.5);
}

`;

export default async function draw(given: Given, space: Space) {
  const holon = given.holon!;
  const types = await Promise.all(
    holon.instance.map(async (id: Id) => (await space.holon(id))?.body.title ?? id),
  );
  const title = String(holon.body.title ?? holon.id);
  const what = `${types.join(", ")} · in ${holon.store}`;

  if (given.draws === "face") {
    const face = card(holon.id);
    face.append(element("strong", undefined, title), element("span", "meta", what));
    follow(face, space);
    return face;
  }

  const article = element("article", "place holon");
  article.append(way([]), element("h1", undefined, title), element("p", "meta", what));

  article.append(element("h2", undefined, "Is an instance of"));
  article.append(space.openList(holon.instance, "whole", { draws: "face" }));

  article.append(element("h2", undefined, "Holds"));
  const values = element("dl", "values");
  for (const [key, value] of Object.entries(holon.body))
    values.append(element("dt", undefined, key), valueOf(value, space));
  article.append(values);

  follow(article, space);
  return article;
}

// A value as it is: a reference mounted as a face of what it points at, a
// list item by item, a set of fields key by key, and text and numbers as
// text, long text kept in its own box.
function valueOf(value: Json, space: Space): HTMLElement {
  const held = element("dd");
  held.append(...contentOf(value, space));
  return held;
}

function contentOf(value: Json, space: Space): Node[] {
  if (isRef(value)) return refOf(value, space);

  if (Array.isArray(value) && value.length && value.every(isRef) && !value.some((ref) => ref["@"]))
    return [
      space.openList(
        value.map((ref) => ref.$ref),
        "whole",
        { draws: "face" },
      ),
    ];

  if (Array.isArray(value)) {
    const items = element("ol");
    for (const item of value) {
      const listed = element("li");
      listed.append(...contentOf(item, space));
      items.append(listed);
    }
    return [items];
  }

  if (value !== null && typeof value === "object") {
    const fields = element("dl", "values");
    for (const [key, inner] of Object.entries(value))
      fields.append(element("dt", undefined, key), valueOf(inner, space));
    return [fields];
  }

  // Text that links into the field is prose, drawn so its links can be
  // followed; other long text is kept in its own box.
  if (typeof value === "string" && value.includes("](ref:")) {
    const prose = element("div", "prose");
    prose.innerHTML = markdown.parse(value) as string;
    return [prose];
  }
  if (typeof value === "string" && (value.length > 160 || value.includes("\n")))
    return [element("pre", undefined, value)];
  return [document.createTextNode(String(value))];
}

// A reference, as the face of what it points at; a pinned one says so, since
// what is drawn is the holon as it stands now, not the version it pins.
function refOf(ref: { $ref: Id; "@"?: string }, space: Space): Node[] {
  const face = space.open(ref.$ref, "face");
  if (!ref["@"]) return [face];
  return [face, element("span", "meta", `pinned to ${ref["@"].slice(0, 15)}…, shown as it stands now`)];
}

const isRef = (value: Json): value is { $ref: Id; "@"?: string } =>
  typeof value === "object" && value !== null && !Array.isArray(value) && typeof value.$ref === "string";
