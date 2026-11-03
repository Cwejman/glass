import type { Id } from "../../src/store/id.ts";
import type { Given, Kind, Space } from "../../src/interface/component.ts";
import { h } from "./jsx.ts";

// A list of holons, each item a slot of its own, drawn by whatever is found
// for it, a face unless the whole that opened the list asks otherwise.
// Where the whole numbers its items, each is numbered by its place, running
// on from the whole's own number.

interface Asked {
  kind?: Kind;
  numbered?: boolean;
  number?: string;
}

export default function draw({ list, with: passed }: Given, space: Space) {
  const asked = (passed ?? {}) as Asked;
  const numberAt = (i: number) => (asked.number ? `${asked.number}.${i + 1}` : `${i + 1}`);

  return (
    <ol class="list">
      {(list ?? []).map((id: Id, i) => (
        <li>{space.open(id, asked.kind ?? "face", asked.numbered ? { number: numberAt(i) } : null)}</li>
      ))}
    </ol>
  );
}
