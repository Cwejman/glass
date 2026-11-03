import type { Declaration, Given, Space } from "../../src/interface/component.ts";
import type { ExpressionBody } from "./bodies.ts";
import { h } from "./jsx.ts";
import { words } from "./words.ts";

// An expression, a way of looking at the field: as a face, what it is
// called and what it gathers, said in words; in full, those, and what it
// gathers now, each a slot offered a face. A grouping is drawn as its
// collections, the larger first, each said by the value its holons share
// and how many there are, and each a way of looking of its own that a
// press can open, grouped again by what splits it best; then what had no
// value on its axis. What nothing splits is drawn as it is.

export const declared = {
  title: "Expression",
  says: "An expression: as a face, its title and its words; in full, those and what it gathers, a list of faces.",
  takes: ["expression"],
  kinds: ["full", "face"],
  reads: ["gather", "holon", "groups"],
} satisfies Declaration;

export default async function draw(given: Given<ExpressionBody>, space: Space) {
  const { title, gathers } = given.holon!.body;
  const said = await words(gathers, async (id) => String((await space.holon(id))?.body.title ?? id));

  if (given.kind === "face")
    return (
      <div class="card">
        <strong>{title}</strong>
        <span class="meta">{said}</span>
      </div>
    );

  const gathered = await space.read({ gather: gathers });
  const grouped = await space.read({ groups: gathers });
  if (grouped && grouped.groups.length > 0) {
    const collections = await Promise.all(
      grouped.groups.map(async ({ value, count, gathers }) => {
        const holon = grouped.by === "store" ? null : await space.holon(value);
        const titled =
          grouped.by === "store" ? value : String(holon?.body.title ?? "what is no longer in the field");
        return (
          <div
            class="slot face collection"
            tabindex="0"
            data-expression={JSON.stringify({ group: gathers, by: "strongest" })}
            data-title={titled}
          >
            <div class="card">
              <strong>{titled}</strong>
              <span class="meta">{count === 1 ? "one holon" : `${count} holons`}</span>
            </div>
          </div>
        );
      }),
    );
    return (
      <article class="place expression">
        <h1>{title}</h1>
        <p class="meta">
          {said}, {gathered.length === 1 ? "one holon" : `${gathered.length} holons`} in{" "}
          {collections.length === 1 ? "one collection" : `${collections.length} collections`}
        </p>
        <div class="collections">{collections}</div>
        {grouped.rest.length > 0 && space.open(grouped.rest, { offer: { kind: "face" } })}
      </article>
    );
  }

  return (
    <article class="place expression">
      <h1>{title}</h1>
      <p class="meta">
        {said}, {gathered.length === 1 ? "one holon" : `${gathered.length} holons`}
      </p>
      {space.open(gathered, { offer: { kind: "face" } })}
    </article>
  );
}
