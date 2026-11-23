// Where a holon stands in the holarchy: the wholes that hold it, from its store's root
// down to it, each a step back to it, as the function wholes gives them, in one read.
// Each is called as a card calls it (summary.ts).
//
// The trail is the top of the page at rest, the bar's input shown only while asking
// (asking.ts): a press on its line, away from its links, or on its expression button at
// its end, opens the input in its place. It begins at home, the start of the page, and
// at home it is the expression button alone.

import { href, hrefTo } from "../../chassis/web/href.ts";
import { h, type Child } from "../../chassis/web/jsx.ts";
import { isRef, ref } from "../../engine/read/values.ts";
import { asking } from "./asking.ts";
import { applying, applyingEach, type Glass } from "../../language/shipped.ts";
import type { Space } from "../../chassis/web/chassis.ts";
import { saidOf, titleOf } from "./summary.ts";

export type Step = { id: string; name?: string };

// The wholes holding a holon, its root first, and the holon itself last (wholes, written
// in the language), each called as a card calls it.
export async function wholesOf(read: Space["read"], glass: Glass, id: string): Promise<Step[]> {
  const answer = await read(applying(glass, "wholes", ref(id)));
  // Each whole once, should holding come round on itself.
  const ids = [
    ...new Set(
      "value" in answer && Array.isArray(answer.value)
        ? answer.value.filter(isRef).map(({ $ref }) => $ref)
        : [],
    ),
  ];
  const holons = await read(
    applyingEach(
      glass,
      "holon",
      ids.map((each) => [ref(each)]),
    ),
  );
  const found = "value" in holons && Array.isArray(holons.value) ? holons.value : [];
  return ids.map((each, i) => ({ id: each, name: titleOf(saidOf(found[i] ?? null), each) }));
}

// The steps as a breadcrumb, from home: each whole a link, the holon itself where it ends.
export function trailOf(steps: Step[]): Node {
  const [...wholes] = steps.slice(0, -1);
  const here = steps.at(-1);
  return line([
    home(),
    ...wholes.map(({ id, name }) => (
      <li>
        <a href={hrefTo(id)} data-ref={id}>
          {name ?? `@${id}`}
        </a>
      </li>
    )),
    here && (
      <li aria-current="page" data-ref={here.id}>
        {here.name ?? "this"}
      </li>
    ),
  ]);
}

// What was asked, where it is no holon to stand at: its text, as one step.
export const saidTrail = (text: string): Node =>
  line([
    home(),
    <li aria-current="page" class="said">
      <code>{text}</code>
    </li>,
  ]);

// At home, the start of the page: nothing to stand at, only the expression button.
export const homeTrail = (): Node => line([]);

// The way home, the first step of every trail.
const home = () => (
  <li>
    <a href={href("")} class="home">
      Glass
    </a>
  </li>
);

function line(items: Child[]): Node {
  const open = (event: Event) => {
    if ((event.target as Element).closest("a")) return;
    event.preventDefault();
    asking(true);
  };
  return (
    <nav class="trail" aria-label="Where this stands" onClick={open}>
      <ol>{items}</ol>
      <button type="button" class="ask" aria-label="Type an expression" title="Type an expression  /">
        λ
      </button>
    </nav>
  );
}
