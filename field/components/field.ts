import type { Id } from "../../src/store/id.ts";
import type { Given, Space } from "../../src/interface/component.ts";
import { element } from "./element.ts";
import { follow } from "./way.ts";

// The field itself, the root: the stores it holds, each with the names it
// gives, and every type in the field, the way into everything it holds.

export const style = `
.field .store {
  font: var(--small) / var(--leading-close) var(--sans);
  color: var(--quiet);
  margin: 0 0 calc(var(--gap) * 0.75);
}

.field .store strong {
  color: var(--ink);
  font-weight: 600;
  margin-right: 0.6em;
}

.field .names {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: calc(var(--gap) * 0.5) var(--gap);
  align-items: center;
  margin: 0 0 var(--gap);
}

.field .names > .name {
  font: var(--small) / var(--leading-close) var(--mono);
  color: var(--quiet);
}
`;

export default function draw(given: Given, space: Space) {
  const field = given.field!;
  const article = element("article", "place field");
  article.append(element("h1", undefined, "The field"));

  article.append(element("h2", undefined, "Its stores"));
  for (const store of field.stores) {
    const line = element("p", "store");
    line.append(element("strong", undefined, store.key));
    line.append(store.head ? `at ${store.head.slice(0, 15)}…` : "nothing committed yet");
    article.append(line);

    const names = Object.entries(store.names);
    if (names.length === 0) continue;
    const given = element("div", "names");
    for (const [name, id] of names) given.append(element("span", "name", name), space.open(id, "face"));
    article.append(given);
  }

  article.append(element("h2", undefined, "Its types"));
  article.append(
    space.openList(
      field.types.map(({ id }): Id => id),
      "whole",
      { draws: "face" },
    ),
  );

  follow(article, space);
  return article;
}
