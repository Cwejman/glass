// What a way of looking gathers, counted by the value each holds under the key its
// settings name, its name unless they say, as bars, the most first: a widget, drawn only
// where a board names it. A holon that holds nothing under that key is counted as unsaid.

import type { Given, Space } from "../interface/component.ts";
import { h } from "./jsx.ts";

export const declared = {
  name: "Bars",
  says: "What a way of looking gathers, counted by the value each holds under a key, as bars, the most first; a widget, drawn where a board names it.",
  takes: [],
  kinds: ["full", "face"],
  argument: "list",
  named: true,
  reads: [],
  settings: {
    by: {
      says: "The key whose value each holon is counted by; its name unless it says.",
      shape: "string",
      optional: true,
    },
  },
};

export const style = `
.bars { display: grid; grid-template-columns: max-content 1fr max-content; gap: 0.35em 0.75em; align-items: center; margin: 0; }
.bars dt { font: var(--smaller) / var(--leading-close) var(--sans); }
.bars dd { margin: 0; height: 0.6em; border-radius: var(--radius); background: var(--quiet); }
.bars .tally { font-variant-numeric: tabular-nums; }
`;

const unsaid = "unsaid";

// A value as a bar says it: as it is where it is plain, else as written.
const saidOf = (value: unknown) =>
  value === undefined || value === null
    ? unsaid
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

// How many hold each value, the most first.
function talliesOf(values: string[]) {
  const tallies = new Map<string, number>();
  for (const value of values) tallies.set(value, (tallies.get(value) ?? 0) + 1);
  return [...tallies].sort(([, a], [, b]) => b - a);
}

export default async function draw({ list = [], settings }: Given<never, { by?: string }>, space: Space) {
  const by = settings.by ?? "name";
  const values = await Promise.all(
    list.map(async (id) => {
      const holon = await space.holon(id);
      return saidOf(holon && { name: holon.name, ...holon.body }[by]);
    }),
  );

  const tallies = talliesOf(values);
  const most = tallies[0]?.[1] ?? 1;

  return (
    <dl class="bars">
      {tallies.flatMap(([value, count]) => [
        <dt>{value}</dt>,
        <dd style={`width: ${(count / most) * 100}%`} />,
        <span class="tally">{String(count)}</span>,
      ])}
    </dl>
  );
}
