// A board: what one watches at a glance. Each widget is a slot of its own, said as a
// mount is, given holons or a way of looking and drawn by the component it names, so a
// number, bars or a timeline stand beside a list; laid out to fit the room, each across
// the columns it spans. A widget given a board draws that board whole within it. Seen
// from above, a board is its name and how many it watches.

import type { Looking as Expression } from "../engine/compat.ts";
import type { Given, Space, Where } from "../interface/component.ts";
import { h } from "./jsx.ts";

export const declared = {
  name: "Board",
  says: "What one watches at a glance: its widgets, each a slot drawn by the component it names, laid out to fit the room; seen from above, its name and how many widgets it holds.",
  takes: ["board"],
  kinds: ["full", "face"],
  reads: [],
};

// Widgets fit the board, not the screen: one spanning more columns than the board has
// room for spans them all, so a board within a board never runs past its edge.
export const style = `
.board-room { container-type: inline-size; }
.board { display: grid; gap: var(--gap); grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); }
.widget { display: grid; align-content: start; gap: calc(var(--gap) * 0.5); padding: var(--gap); border: var(--hairline) solid var(--line); border-radius: var(--radius); min-width: 0; }
.widget > h2 { margin: 0; font: var(--smaller) / var(--leading-close) var(--sans); color: var(--quiet); }
.widget.span-2 { grid-column: span 2; }
.widget.span-3 { grid-column: 1 / -1; }
@container (max-width: 29rem) { .widget.span-2 { grid-column: 1 / -1; } }
`;

type Widget = {
  says?: string;
  component?: { $ref: string };
  argument?: { $ref: string }[];
  gathers?: Expression;
  settings?: Record<string, unknown>;
  span?: number;
};

// Where a widget looks: the way of looking it gathers, or the holons it is given. One
// holon given to no component in particular is that holon, drawn whole, as a board within
// a board is; a widget component is given its holons as a list, even one. So a widget is
// not said where a mount is, whose one holon is always itself.
const isOne = ({ gathers, argument = [], component }: Widget) =>
  !gathers && !component && argument.length === 1;

const whereOf = (widget: Widget): Where =>
  widget.gathers
    ? { gather: widget.gathers }
    : isOne(widget)
      ? widget.argument![0]!.$ref
      : (widget.argument ?? []).map(({ $ref }) => $ref);

const spanOf = ({ span = 1 }: Widget) => Math.min(Math.max(Math.round(span), 1), 3);

export default function draw(given: Given<{ widgets?: Widget[] }>, space: Space) {
  const board = given.holon!;
  const widgets = board.body.widgets ?? [];

  if (given.kind === "face") {
    return (
      <div class="card">
        <strong>{board.name ?? "A board"}</strong>
        <span class="meta">{widgets.length === 1 ? "watches 1" : `watches ${widgets.length}`}</span>
      </div>
    );
  }

  return (
    <article class="place">
      <h1>{board.name ?? "A board"}</h1>
      <div class="board-room">
        <div class="board">
          {widgets.map((widget) => (
            <section class={`widget span-${spanOf(widget)}`}>
              {widget.says && <h2>{widget.says}</h2>}
              {space.open(whereOf(widget), {
                kind: isOne(widget) ? "full" : "face",
                ...(widget.component ? { component: widget.component.$ref } : {}),
                ...(widget.settings ? { settings: widget.settings } : {}),
              })}
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}
