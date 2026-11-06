import type { Declaration, Given, Space, Where } from "../../interface/component.ts";
import type { ListSettings } from "./bodies.ts";
import { h } from "./jsx.ts";

// A list of places, each item a slot of its own, drawn by whatever is found
// for it. Given holons, it lists them; given a way of looking, what it
// gathers, and, where it groups, its collections first, each a way of
// looking of its own, a collection of one being that one holon, then what
// had no value on its axis. A list shows its items at a glance, so it
// offers each a face, whatever was offered the list itself; an item that
// should stand in full is looked at by itself. Its items stand one under
// another, or as cards side by side where there is room. Where the whole
// numbers its items, each is numbered by its place, running on from the
// whole's own number.

export const declared = {
  title: "List",
  says: "A list of places, holons or the collections a way of looking groups into, each item a slot offered a face, seen at a glance, numbered where the whole numbers its parts.",
  takes: [],
  kinds: ["full", "face"],
  argument: "list",
  reads: ["groups", "gather"],
  settings: {
    numbered: {
      says: "Whether each item is numbered by its place.",
      shape: "boolean",
      optional: true,
    },
    number: {
      says: "The number of the whole whose items these are, which each item's number runs on from.",
      shape: "string",
      optional: true,
    },
    cards: {
      says: "Whether its items stand as cards side by side, where there is room, rather than one under another.",
      shape: "boolean",
      optional: true,
    },
  },
} satisfies Declaration;

export default async function draw(
  { list, gathers, kind, settings: asked }: Given<never, ListSettings>,
  space: Space,
) {
  const numberAt = (i: number) => (asked.number ? `${asked.number}.${i + 1}` : `${i + 1}`);
  // Seen as a face, a way of looking is listed as what it gathers, so a list
  // never opens layer after layer inside itself.
  const grouped = gathers && kind === "full" ? await space.read({ groups: gathers }) : null;
  const places: Where[] = grouped?.groups.length
    ? [
        ...(await Promise.all(
          grouped.groups.map(async ({ count, gathers }) =>
            count === 1 ? (await space.read({ gather: gathers }))[0]! : { gather: gathers },
          ),
        )),
        ...grouped.rest,
      ]
    : (list ?? []);

  return (
    <ol class={asked.cards ? "list cards" : "list"}>
      {places.map((place: Where, i) => (
        <li>
          {space.open(place, {
            offer: { kind: "face" },
            // A number is a holon's to stand before; a collection takes none.
            ...(asked.numbered && typeof place === "string" ? { settings: { number: numberAt(i) } } : {}),
          })}
        </li>
      ))}
    </ol>
  );
}
