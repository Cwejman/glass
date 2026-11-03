import type { Id } from "../../src/store/id.ts";
import type { Given, Space } from "../../src/interface/component.ts";
import { element } from "./element.ts";

// A list of holons, each item a mount of its own, drawn by whatever is found
// for it, as a face unless the whole that opened the list asks otherwise.
// Where the whole numbers its items, each is numbered by its place, running
// on from the whole's own number.

interface Asked {
  draws?: string;
  numbered?: boolean;
  number?: string;
}

export default function draw({ list, with: passed }: Given, space: Space) {
  const asked = (passed ?? {}) as Asked;
  const items = element("ol", "list");

  (list ?? []).forEach((id: Id, i) => {
    const number = asked.numbered ? (asked.number ? `${asked.number}.${i + 1}` : `${i + 1}`) : undefined;
    const item = element("li");
    item.append(space.open(id, asked.draws ?? "face", number ? { number } : null));
    items.append(item);
  });

  return items;
}
