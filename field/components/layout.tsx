import type { Given, Space } from "../../src/interface/component.ts";
import { bodyOf, type Layout } from "./bodies.ts";
import { h } from "./jsx.ts";

// A layout: its mounts side by side, edge to edge, each a pane, a slot of
// the kind its mount says, full unless it says otherwise. A pane scrolls
// within itself and says when it is scrolled, so the material can fade what
// passes out of sight; how a pane is set off from the next, by space or by
// a line, is the material's too.

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
  const { mounts } = bodyOf<Layout>(given.holon!);
  const panes = mounts.map((_, index) => space.openMount(index));
  for (const pane of panes)
    pane.addEventListener("scroll", () => pane.toggleAttribute("data-scrolled", pane.scrollTop > 0), {
      passive: true,
    });
  return <div class="panes">{panes}</div>;
}
