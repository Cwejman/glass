import type { Id } from "../../src/store/id.ts";
import type { Given, Space } from "../../src/interface/component.ts";
import { element } from "./element.ts";
import { card, follow, way } from "./way.ts";

// A type: what an instance of it is, each field it declares with what the
// field means and its shape, and its instances, a list of mounts. Seen from
// above, its title, what it says and how many instances it has.

export const style = `
.type-fields {
  margin: 0;
  display: grid;
  gap: calc(var(--gap) * 0.75);
}

.type-fields dt {
  font: var(--small) / var(--leading-close) var(--mono);
}

.type-fields dt .shape {
  color: var(--quiet);
  margin-left: 0.6em;
}

.type-fields dd {
  margin: 0.15em 0 0;
  color: var(--quiet);
}
`;

interface Connector {
  says: string;
  shape: unknown;
  optional?: boolean;
}

export default async function draw(given: Given, space: Space) {
  const type = given.holon!;
  const instances = (await space.read({ instances: type.id })) as Id[];

  if (given.draws === "face") {
    const face = card(type.id);
    face.append(element("strong", undefined, String(type.body.title ?? type.id)));
    face.append(element("span", "meta", `${String(type.body.says ?? "")} · ${instances.length} instances`));
    follow(face, space);
    return face;
  }

  const article = element("article", "place type");
  article.append(way([]), element("h1", undefined, String(type.body.title ?? type.id)));
  if (type.body.says) article.append(element("p", undefined, String(type.body.says)));

  article.append(element("h2", undefined, "Its fields"));
  const fields = element("dl", "type-fields");
  for (const [key, connector] of Object.entries(
    (type.body.fields ?? {}) as unknown as Record<string, Connector>,
  )) {
    const term = element("dt", undefined, key);
    term.append(
      element("span", "shape", `${shapeOf(connector.shape)}${connector.optional ? ", optional" : ""}`),
    );
    fields.append(term, element("dd", undefined, connector.says));
  }
  article.append(fields);

  article.append(element("h2", undefined, `Its instances, ${instances.length}`));
  article.append(space.openList(instances, "whole", { draws: "face" }));

  follow(article, space);
  return article;
}

function shapeOf(shape: unknown): string {
  if (typeof shape === "string") return shape;
  if (shape && typeof shape === "object" && "list" in shape) return `list of ${shapeOf(shape.list)}`;
  return "fields";
}
