import type { Id } from "../../src/store/id.ts";
import type { Declaration, Given, Kind, Space } from "../../src/interface/component.ts";
import type { ListSettings } from "./bodies.ts";
import { h } from "./jsx.ts";

// A list of holons, each item a slot of its own, drawn by whatever is found
// for it, a face unless the whole that opened the list asks otherwise.
// Where the whole numbers its items, each is numbered by its place, running
// on from the whole's own number.

export const declared = {
  title: "List",
  says: "A list of holons, each item a slot, a face unless the whole that opened it asks otherwise, numbered where the whole numbers its parts.",
  takes: [],
  kinds: ["full"],
  argument: "list",
  settings: {
    kind: {
      says: "The kind of slot each item is, face unless it says full.",
      shape: "string",
      optional: true,
    },
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
  },
} satisfies Declaration;

export default function draw({ list, settings: asked }: Given<never, ListSettings>, space: Space) {
  const kind: Kind = asked.kind === "full" ? "full" : "face";
  const numberAt = (i: number) => (asked.number ? `${asked.number}.${i + 1}` : `${i + 1}`);

  return (
    <ol class="list">
      {(list ?? []).map((id: Id, i) => (
        <li>{space.open(id, kind, asked.numbered ? { number: numberAt(i) } : {})}</li>
      ))}
    </ol>
  );
}
