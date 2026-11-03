import type { Id } from "../../src/store/id.ts";
import type { Declaration, Given, Space } from "../../src/interface/component.ts";
import { h } from "./jsx.ts";
import { follow } from "./way.tsx";

// The field itself, the root: the stores it holds, each with the names it
// gives, and every type in the field, the way into everything it holds.

export const declared = {
  title: "Field",
  says: "The field itself, the root: its stores, the names each gives, and every type it holds.",
  takes: [],
  kinds: ["full"],
  argument: "field",
} satisfies Declaration;

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

  return (
    <article class="place field" onClick={follow(space)}>
      <h1>The field</h1>

      <h2>Its stores</h2>
      {field.stores.map(({ key, head, names }) => [
        <p class="store">
          <strong>{key}</strong>
          {head ? `at ${head.slice(0, 15)}…` : "nothing committed yet"}
        </p>,
        Object.keys(names).length > 0 && (
          <div class="names">
            {Object.entries(names).map(([name, id]) => [
              <span class="name">{name}</span>,
              space.open(id, { offer: { kind: "face" } }),
            ])}
          </div>
        ),
      ])}

      <h2>Its types</h2>
      {space.open(
        field.types.map(({ id }): Id => id),
        { offer: { kind: "face" } },
      )}
    </article>
  );
}
