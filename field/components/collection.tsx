import type { Declaration, Given, Space } from "../../src/interface/component.ts";
import { h } from "./jsx.ts";
import { partSaid, partsOf, programsIn } from "./parts.ts";

// A collection, seen from outside: a way of looking as a face, said by the
// value it narrows to, the last of its parts, and how many it gathers,
// entered by a press as any place is.

export const declared = {
  title: "Collection",
  says: "A way of looking as a face: the value it narrows to and how many it gathers, entered by a press.",
  takes: [],
  kinds: ["face"],
  argument: "expression",
  reads: ["holon", "name", "instances"],
} satisfies Declaration;

export default async function draw(given: Given, space: Space) {
  const programs = await programsIn({
    name: () => space.read({ name: "program" }),
    instances: (type) => space.read({ instances: type }),
    holon: (id) => space.holon(id),
  });
  const last = partsOf(programs, given.gathers!).parts.at(-1);
  const titled = async (id: string) =>
    String((await space.holon(id))?.body.title ?? "what is no longer in the field");
  const said = last ? (await partSaid(programs, last, titled)).value : "Everything";
  const count = given.list?.length ?? 0;
  return (
    <div class="card">
      <strong>{said}</strong>
      <span class="meta">{count === 1 ? "1 holon" : `${count} holons`}</span>
    </div>
  );
}
