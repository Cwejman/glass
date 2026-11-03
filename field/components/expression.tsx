import type { Declaration, Given, Space } from "../../src/interface/component.ts";
import { h } from "./jsx.ts";
import { programsIn, titleOf, together } from "./parts.ts";

// A way of looking, drawn as what it gathers: said by its parts, and how
// many it gathers. A grouping is drawn as its collections, the larger
// first, each said by the value its holons share and how many there are,
// and each a way of looking of its own that a press can open, grouped again
// by what splits it best; then what had no value on its axis. What nothing
// splits is drawn as it is, a list of faces.

export const declared = {
  title: "Expression",
  says: "A way of looking, drawn as what it gathers: in collections where it groups, else a list of faces.",
  takes: [],
  kinds: ["full"],
  argument: "expression",
  reads: ["holon", "groups", "name", "instances"],
} satisfies Declaration;

export default async function draw(given: Given, space: Space) {
  const gathers = given.gathers!;
  const gathered = given.list ?? [];
  const programs = await programsIn({
    name: () => space.read({ name: "program" }),
    instances: (type) => space.read({ instances: type }),
    holon: (id) => space.holon(id),
  });
  const said = await titleOf(programs, gathers, async (id) =>
    String((await space.holon(id))?.body.title ?? id),
  );
  const counted = gathered.length === 1 ? "one holon" : `${gathered.length} holons`;

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
            data-expression={JSON.stringify(together(programs, { parts: [gathers], by: "auto" }))}
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
        <h1>{said}</h1>
        <p class="meta">
          {counted} in {collections.length === 1 ? "one collection" : `${collections.length} collections`}
        </p>
        <div class="collections">{collections}</div>
        {grouped.rest.length > 0 && space.open(grouped.rest, { offer: { kind: "face" } })}
      </article>
    );
  }

  return (
    <article class="place expression">
      <h1>{said}</h1>
      <p class="meta">{counted}</p>
      {space.open(gathered, { offer: { kind: "face" } })}
    </article>
  );
}
