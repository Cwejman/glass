import type { Given, Space } from "../../src/interface/component.ts";
import { h } from "./jsx.ts";

// A layout: its mounts side by side, edge to edge, each a pane, a slot of
// the kind its mount says, full unless it says otherwise. How a pane is
// set off from the next, by space or by a line, is the material's.

export const style = `
.panes {
  display: flex;
  gap: var(--pane-gap);
  align-items: stretch;
}

.panes > .slot {
  flex: 1 1 0;
  min-width: 0;
}
`;

export default function draw(given: Given, space: Space) {
  const mounts = (given.holon!.body.mounts ?? []) as unknown[];
  return <div class="panes">{mounts.map((_, index) => space.openMount(index))}</div>;
}
