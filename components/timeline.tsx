// What a way of looking gathers, each placed in time from the moment it holds under one
// key to the moment under another, across the time they span together: a widget, drawn
// only where a board names it. One with no end yet runs to the moment it is drawn, and
// is said to be running; it is drawn again when the field changes, not as time goes.
// What holds no moment to begin is counted apart, not placed.

import type { Given, Space } from "../interface/component.ts";
import { h } from "./jsx.ts";

export const declared = {
  name: "Timeline",
  says: "What a way of looking gathers, placed in time from one key's moment to another's; a widget, drawn where a board names it.",
  takes: [],
  kinds: ["full", "face"],
  argument: "list",
  named: true,
  reads: [],
  settings: {
    from: { says: "The key holding the moment each begins.", shape: "string" },
    to: {
      says: "The key holding the moment each ends, absent while it runs.",
      shape: "string",
      optional: true,
    },
  },
};

export const style = `
.timeline { display: grid; gap: 0.35em; margin: 0; padding: 0; list-style: none; }
.timeline li { display: grid; gap: 0.15em; }
.timeline .span { position: relative; height: 0.6em; }
.timeline .span > span { position: absolute; top: 0; bottom: 0; border-radius: var(--radius); background: var(--quiet); min-width: 2px; }
.timeline .running > span { background: var(--ink, currentColor); }
.timeline .label { font: var(--smaller) / var(--leading-close) var(--sans); }
`;

// A moment as a reader says it: the time of day, and the day too where the line spans more.
const sayer = (days: boolean) => (moment: number) =>
  new Date(moment).toLocaleString([], {
    ...(days ? { month: "short", day: "numeric" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function draw(
  { list = [], settings }: Given<never, { from?: string; to?: string }>,
  space: Space,
) {
  const at = (value: unknown) => (typeof value === "string" ? Date.parse(value) : NaN);
  const placed = await Promise.all(
    list.map(async (id) => {
      const holon = await space.holon(id);
      const from = at(holon?.body[settings.from ?? "began"]);
      const to = at(holon?.body[settings.to ?? "ended"]);
      return { label: holon?.name ?? id, from, to: Number.isNaN(to) ? null : to };
    }),
  );
  const unplaced = placed.filter(({ from }) => Number.isNaN(from)).length;
  const inTime = placed.filter(({ from }) => !Number.isNaN(from));

  if (!inTime.length) return <p class="meta">Nothing placed in time.</p>;

  inTime.sort((a, b) => a.from - b.from);
  const first = inTime[0]!.from;
  const now = Date.now();
  const last = Math.max(...inTime.map(({ to }) => to ?? now));
  const timeOf = sayer(new Date(first).toDateString() !== new Date(last).toDateString());
  const whole = Math.max(last - first, 1);
  const share = (moment: number) => `${((moment - first) / whole) * 100}%`;

  return (
    <ol class="timeline">
      {inTime.map(({ label, from, to }) => (
        <li>
          <span class="label">{`${label} · ${timeOf(from)}${to ? `–${timeOf(to)}` : ", running"}`}</span>
          <div class={to ? "span" : "span running"}>
            <span style={`left: ${share(from)}; width: calc(${share(to ?? now)} - ${share(from)})`} />
          </div>
        </li>
      ))}
      {unplaced > 0 && <li class="meta">{`${unplaced} hold no moment to begin, and are not placed`}</li>}
    </ol>
  );
}
