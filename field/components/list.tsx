import type { Id } from "../../src/store/id.ts";
import type { Declaration, Given, Space } from "../../src/interface/component.ts";
import type { ListSettings } from "./bodies.ts";
import { h } from "./jsx.ts";

// A list of holons, each item a slot of its own, drawn by whatever is found
// for it. A list shows its items at a glance, so it offers each a face,
// whatever was offered the list itself; an item that should stand in full
// is looked at by itself. Its items stand one under another, or as cards
// side by side where there is room. Where the whole numbers its
// items, each is numbered by its place, running on from the whole's own
// number.

export const declared = {
  title: "List",
  says: "A list of holons, each item a slot offered a face, seen at a glance, numbered where the whole numbers its parts.",
  takes: [],
  kinds: ["full", "face"],
  argument: "list",
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

export default function draw({ list, settings: asked }: Given<never, ListSettings>, space: Space) {
  const numberAt = (i: number) => (asked.number ? `${asked.number}.${i + 1}` : `${i + 1}`);

  return (
    <ol class={asked.cards ? "list cards" : "list"}>
      {(list ?? []).map((id: Id, i) => (
        <li>
          {space.open(id, {
            offer: { kind: "face" },
            ...(asked.numbered ? { settings: { number: numberAt(i) } } : {}),
          })}
        </li>
      ))}
    </ol>
  );
}
