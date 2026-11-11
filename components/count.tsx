// How many a way of looking gathers, said as one large number: a widget, drawn only
// where a board names it, live as what it gathers changes.

import type { Given } from "../interface/component.ts";
import { h } from "./jsx.ts";

export const declared = {
  name: "Count",
  says: "How many a way of looking gathers, as one large number; a widget, drawn where a board names it.",
  takes: [],
  kinds: ["full", "face"],
  argument: "list",
  named: true,
  reads: [],
};

export const style = `
.count { font: 600 2.6rem / 1 var(--sans); font-variant-numeric: tabular-nums; }
`;

export default function draw({ list = [] }: Given<never>) {
  return <div class="count">{String(list.length)}</div>;
}
