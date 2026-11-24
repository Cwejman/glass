// A read, drawn as what it gives, again whenever that changes; and above it where it
// stands: where it gives a holon, the wholes holding it, each a step back (trail.tsx),
// else the read as typed. Given nothing, the read of a blank text, it draws the start:
// the field's roots, each store by its root. Given another read, the chassis keeps the
// answer shown until the new one is read, its trail with it, so the two change in one
// moment, the new one read from its top.

import { h, type Child } from "./jsx.ts";
import type { Read } from "../../engine/engine.ts";
import { isRecord, isRef, type Value } from "../../engine/read/values.ts";
import { q } from "../../language/shipped.ts";
import type { IO, Realization } from "../../chassis/web/chassis.ts";
import { homeTrail, saidTrail, trailTo } from "./trail.tsx";

export const answer: Realization = ([read = null], io) => {
  if (read !== null && !(isRecord(read) && "gives" in read))
    return laidOut(homeTrail(), <p class="note">What answer is given is no read to draw.</p>);

  const start = read === null;
  const value = io.read(start ? q`roots()` : (read as unknown as Read));
  const trail = start
    ? homeTrail()
    : value === undefined
      ? null
      : isRef(value)
        ? trailTo(io, value.$ref)
        : typed(io, read);
  return laidOut(
    trail,
    [start && startOf(), value === undefined ? null : io.draw(value)],
    JSON.stringify(read),
  );
};

// The answer keyed by what was asked, so another answer is read from its top.
const laidOut = (trail: Child, content: Child, asked = "") => (
  <div class="answer">
    <div class="trail-at">{trail}</div>
    <div class="answered" data-key={asked}>
      {content}
    </div>
  </div>
);

// A read as it is typed: each of its steps as the language says it, as the pills say
// them, joined by pipes.
function typed(io: IO, read: Value): Node | null {
  const steps = io.read(q`steps(${read})`);
  if (steps === undefined) return null;
  if (!Array.isArray(steps) || !steps.length) return saidTrail("…");
  const texts = steps.map((step) => io.read(q`print(${step})`));
  if (texts.some((text) => text === undefined)) return null;
  return saidTrail(texts.every((text) => typeof text === "string") ? texts.join(" | ") : "…");
}

// What the start says above the field's roots.
const startOf = () => (
  <header class="start">
    <h1>Glass</h1>
    <p class="lede">
      One field, kept in the stores below. Open one, or press λ above to type an expression, as{" "}
      <code>@Knowledge</code>.
    </p>
  </header>
);

export default answer;
