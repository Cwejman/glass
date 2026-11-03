import type { Declaration, Given, Space } from "../../src/interface/component.ts";
import { h } from "./jsx.ts";
import { partSaid, partsOf, programsIn } from "./parts.ts";

// A collection, seen from outside: a way of looking narrowed to one value,
// given with what it gathers. Closed, it is a card: the value it narrows
// to, the last of its parts, and how many it holds, entered by a press as
// any place is. Open, it is a sublist: its name, and beneath it, by spacing
// alone, each holon it holds named, as many as fit a glance, the rest
// counted; each name a place to go.

export const declared = {
  title: "Collection",
  says: "A way of looking as a face: closed, the value it narrows to and how many it holds; open, that name and the holons it holds named beneath it.",
  takes: [],
  kinds: ["face"],
  argument: "expression",
  reads: ["holon", "name", "instances"],
  settings: {
    open: {
      says: "Whether it stands open, its name and the holons it holds named beneath it, rather than closed as a card with how many it holds.",
      shape: "boolean",
      optional: true,
    },
  },
} satisfies Declaration;

// How many holons an open collection names before it only counts.
const named = 12;

export default async function draw(given: Given<never, { open?: boolean }>, space: Space) {
  const programs = await programsIn({
    name: () => space.read({ name: "program" }),
    instances: (type) => space.read({ instances: type }),
    holon: (id) => space.holon(id),
  });
  const last = partsOf(programs, given.gathers!).parts.at(-1);
  const titled = async (id: string) =>
    String((await space.holon(id))?.body.title ?? "what is no longer in the field");
  const said = last ? (await partSaid(programs, last, titled)).value : "Everything";
  const holds = given.list ?? [];
  const count = holds.length === 1 ? "1 holon" : `${holds.length} holons`;

  if (!given.settings.open)
    return (
      <div class="card">
        <strong>{said}</strong>
        <span class="meta">{count}</span>
      </div>
    );

  const names = await Promise.all(
    holds.slice(0, named).map(async (id) => (
      <button type="button" class="member" data-location={JSON.stringify([id])}>
        {await titled(id)}
      </button>
    )),
  );
  return (
    <div class="collection-open">
      <strong>{said}</strong>
      <span class="meta">{count}</span>
      <div class="members">
        {names}
        {holds.length > named && <span class="meta">and {holds.length - named} more</span>}
      </div>
    </div>
  );
}
