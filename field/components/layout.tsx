import type { Declaration, Given, Space } from "../../src/interface/component.ts";
import type { Layout, LayoutSettings } from "./bodies.ts";
import { follow, Way } from "./way.tsx";
import { h } from "./jsx.ts";

// A layout: its mounts side by side, edge to edge, each a pane, a slot of
// the kind its mount says, full unless it says otherwise. A pane scrolls
// within itself and says when it is scrolled, so the material can fade what
// passes out of sight; how a pane is set off from the next, by space or by
// a line, is the material's too.

export const declared = {
  title: "Layout",
  says: "A layout: its mounts as panes side by side, each a full slot.",
  takes: ["layout"],
  kinds: ["full"],
  settings: {
    alone: {
      says: "Whether the layout is the page itself, which stands nowhere and so has no way down to it.",
      shape: "boolean",
      optional: true,
    },
  },
} satisfies Declaration;

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

export default function draw(given: Given<Layout, LayoutSettings>, space: Space) {
  const { mounts } = given.holon!.body;
  const panes = mounts.map((_, index) => space.openMount(index));
  for (const pane of panes)
    pane.addEventListener("scroll", () => pane.toggleAttribute("data-scrolled", pane.scrollTop > 0), {
      passive: true,
    });
  if (given.settings.alone) return <div class="panes">{panes}</div>;
  return (
    <div class="place layout" onClick={follow(space)}>
      <Way steps={[]} />
      <div class="panes">{panes}</div>
    </div>
  );
}
