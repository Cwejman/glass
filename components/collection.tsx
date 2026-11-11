import type { Given, Space } from "../interface/component.ts";
import { h } from "./jsx.ts";
import { partSaid, partsOf, functionsIn } from "./parts.ts";

// A collection, seen from outside: a way of looking narrowed to one value,
// given with what it gathers. Closed, it is a card: the value it narrows
// to, the last of its parts, and how many it holds, entered by a press as
// any place is. Open, it is a sublist: its name, and beneath it, by spacing
// alone, each holon it holds named, as many as fit a glance, the rest
// counted; each name a place to go.

export const declared = {
  name: "Collection",
  says: "A way of looking as a face: closed, the value it narrows to and how many it holds; open, that name and the holons it holds named beneath it.",
  takes: [],
  kinds: ["face"],
  argument: "expression",
  reads: ["holon", "instances"],
  settings: {
    open: {
      says: "Whether it stands open, its name and the holons it holds named beneath it, rather than closed as a card with how many it holds.",
      shape: "boolean",
      optional: true,
    },
  },
};

// How many holons an open collection names before it only counts.
const named = 12;

export default async function draw(given: Given<never, { open?: boolean }>, space: Space) {
  const functions = await functionsIn(space, given.offered);
  const last = partsOf(functions, given.gathers!).parts.at(-1);
  const titled = async (id: string) => {
    const holon = await space.holon(id);
    return holon ? (holon.name ?? holon.id) : "what is no longer in the field";
  };
  const part = last && (await partSaid(functions, last, titled));

  // A function given nothing, as Is a type, has no value to say, so it says itself.
  const said = part ? part.value || part.field : "Everything";
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
