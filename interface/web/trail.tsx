// Where a holon stands in the holarchy: the wholes that hold it, from its store's root
// down to it, each a step back to it. What holds a holon is the one thing it cannot say
// of itself, so each step up is asked of the engine (the native in), the first whole
// holding it taken, until a holon held by none: the root. Each is called as a card calls
// it (summary.ts).

import { h } from "./jsx.ts";
import { isRecord, isRef, ref, type Value } from "../../engine/read/values.ts";
import { applying, applyingEach, type Glass } from "./carried.ts";
import type { Space } from "./chassis.ts";
import { saidOf, titleOf } from "./summary.ts";

// So many steps up are asked at most: a holarchy deeper than this is cut at its top.
const deepest = 24;

export type Step = { id: string; name?: string };

// The wholes holding a holon, its root first, and the holon itself last.
export async function wholesOf(read: Space["read"], glass: Glass, id: string): Promise<Step[]> {
  const ids = [id];
  while (ids.length < deepest) {
    const answer = await read(applying(glass, "in", ref(ids[0]!)));
    const edges = "value" in answer && Array.isArray(answer.value) ? answer.value : [];
    const holder = edges
      .filter((edge) => isRecord(edge) && !isRef(edge))
      .map((edge) => edge as Record<string, Value>)
      .find((edge) => edge.holds === true && isRef(edge.from ?? null));
    const from = holder && isRef(holder.from ?? null) ? (holder.from as { $ref: string }).$ref : undefined;
    if (!from || ids.includes(from)) break;
    ids.unshift(from);
  }

  const answer = await read(
    applyingEach(
      glass,
      "holon",
      ids.map((each) => [ref(each)]),
    ),
  );
  const holons = "value" in answer && Array.isArray(answer.value) ? answer.value : [];
  return ids.map((each, i) => ({ id: each, name: titleOf(saidOf(holons[i] ?? null), each) }));
}

// The steps as a breadcrumb: each whole a link, the holon itself where it ends.
export function trailOf(steps: Step[]): Node {
  const [...wholes] = steps.slice(0, -1);
  const here = steps.at(-1);
  return (
    <nav class="trail" aria-label="Where this stands">
      <ol>
        {wholes.map(({ id, name }) => (
          <li>
            <a href={`?q=@${id}`} data-ref={id}>
              {name ?? `@${id}`}
            </a>
          </li>
        ))}
        {here && (
          <li aria-current="page" data-ref={here.id}>
            {here.name ?? "this"}
          </li>
        )}
      </ol>
    </nav>
  );
}
