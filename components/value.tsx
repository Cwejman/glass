// A value a way of looking gives where it gives no set: a number as one large number,
// words as they are written, a list item under item, a record field by field, a function
// by what it takes, and any holon within it as a face, entered by a press as any place
// is. Live as the value changes. It draws so much and no more, a few levels down and a
// few hundred items in all, and counts what it leaves. Seen from above, what it is.

import type { Given, Space } from "../interface/component.ts";
import { h, type Child } from "./jsx.ts";

export const declared = {
  name: "Value",
  says: "What a way of looking gives where it gives no set, drawn as what it is: a number, words, a list item under item, a record field by field, any holon in it as a face.",
  takes: [],
  kinds: ["full", "face"],
  argument: "value",
  reads: [],
};

export const style = `
.value-number { font: 600 2.6rem / 1 var(--sans); font-variant-numeric: tabular-nums; }
.value-words { white-space: pre-wrap; margin: 0; }
.value-record { display: grid; grid-template-columns: max-content 1fr; gap: 0.35em 1em; margin: 0; }
.value-record dt { color: var(--quiet); }
.value-record dd { margin: 0; min-width: 0; }
`;

// How far a value is drawn: so many levels down, so many items in all.
const deepest = 4;
const most = 300;

const isRef = (value: unknown): value is { $ref: string } =>
  typeof value === "object" && value !== null && typeof (value as { $ref?: unknown }).$ref === "string";

// A function, as the kernel gives one: what it takes.
const isFunction = (value: unknown): value is { function: string } =>
  typeof value === "object" && value !== null && Object.keys(value).length === 1 && "function" in value;

const counted = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

// A value as what it is, each part in turn, until the room for items runs out.
function drawer(space: Space) {
  let left = most;

  // So many of the parts as there is room for, and how many were left.
  const within = <T,>(parts: T[]) => {
    const shown = parts.slice(0, Math.max(left, 0));
    left -= shown.length;
    return { shown, beyond: parts.length - shown.length };
  };

  function drawn(value: unknown, depth: number): Child {
    if (value === null || value === undefined) return <span class="meta">nothing</span>;
    if (typeof value === "number" || typeof value === "boolean")
      return <div class="value-number">{String(value)}</div>;
    if (typeof value === "string") return <p class="value-words">{value}</p>;
    if (isRef(value)) return space.open(value.$ref, { offer: { kind: "face" } });
    if (isFunction(value)) return <span class="meta">{`a function of ${value.function || "nothing"}`}</span>;
    if (depth >= deepest) return <span class="meta">{JSON.stringify(value).slice(0, 200)}</span>;

    if (Array.isArray(value)) {
      const { shown, beyond } = within(value);
      return (
        <ol class={shown.every(isRef) ? "list cards" : "list"}>
          {shown.map((item) => (
            <li>{drawn(item, depth + 1)}</li>
          ))}
          {beyond > 0 && <li class="meta">{`${beyond} more not drawn`}</li>}
        </ol>
      );
    }

    const { shown, beyond } = within(Object.entries(value as Record<string, unknown>));
    return (
      <dl class="value-record">
        {shown.flatMap(([key, inner]) => [<dt>{key}</dt>, <dd>{drawn(inner, depth + 1)}</dd>])}
        {beyond > 0 && [<dt />, <dd class="meta">{`${beyond} more fields not drawn`}</dd>]}
      </dl>
    );
  }

  return drawn;
}

// Seen from above: a number or words as they are, cut short, anything larger by its size.
const glance = (value: unknown) =>
  Array.isArray(value)
    ? counted(value.length, "value")
    : isFunction(value)
      ? `a function of ${value.function || "nothing"}`
      : typeof value === "object" && value !== null
        ? counted(Object.keys(value).length, "field")
        : String(value).slice(0, 80);

export default function draw({ value, kind }: Given<never>, space: Space) {
  if (kind === "face")
    return (
      <div class="card">
        <strong>{glance(value)}</strong>
      </div>
    );

  return <div class="value">{drawer(space)(value, 0)}</div>;
}
