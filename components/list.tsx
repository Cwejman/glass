// A list of places, each item a slot of its own, drawn by whatever is found for it.
// Given holons, it lists them. Given a way of looking, what it gathers, and, where it
// groups, its collections first, each a way of looking of its own, a collection of one
// being that one holon, then what had no value on its axis. A list shows its items at a
// glance, so it offers each a face. Its items stand one under another, or as cards side
// by side where there is room.

import type { Given, Space, Where } from "../interface/component.ts";
import { h } from "./jsx.ts";

export const declared = {
  name: "List",
  says: "A list of places, holons or the collections a way of looking groups into, each item a slot offered a face, seen at a glance.",
  takes: [],
  kinds: ["full", "face"],
  argument: "list",
  reads: ["groups", "gather", "level"],
  settings: {
    cards: {
      says: "Whether its items stand as cards side by side, where there is room, rather than one under another.",
      shape: "boolean",
      optional: true,
    },
  },
};

// How many places a list draws: what stands beyond them is counted, for a page
// cannot hold every holon of a field, and no one reads them flat.
const drawnAtOnce = 200;

export default async function draw(
  { list, gathers, kind, settings }: Given<never, { cards?: boolean }>,
  space: Space,
) {
  // Seen as a face, a way of looking is listed as what it gathers, so a list never
  // opens layer after layer inside itself.
  const grouped = gathers && kind === "full" ? await space.read({ groups: gathers }) : null;

  const collections = grouped?.groups.slice(0, drawnAtOnce) ?? [];
  const holons = grouped
    ? grouped.rest
    : gathers && kind === "full"
      ? await space.read({ level: gathers })
      : (list ?? []);
  const room = drawnAtOnce - collections.length;

  const places: Where[] = [
    ...(await Promise.all(
      collections.map(async ({ count, gathers }) =>
        count === 1 ? (await space.read({ gather: gathers }))[0]! : { gather: gathers },
      ),
    )),
    ...holons.slice(0, room),
  ];

  const total = (grouped?.groups.length ?? 0) + holons.length;

  return (
    <ol class={settings.cards ? "list cards" : "list"}>
      {places.map((place) => (
        <li>{space.open(place, { offer: { kind: "face" } })}</li>
      ))}
      {total > places.length && (
        <li class="meta">{total - places.length} more not drawn. Narrow what is looked at to reach them.</li>
      )}
    </ol>
  );
}
