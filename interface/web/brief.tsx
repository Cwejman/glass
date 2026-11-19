// A brief: its name, its flow, and its sections read through after it, each a heading
// leading to it, then the flow and sections of its own. Each brief is read as a whole
// that enters no brief within it, live, so its prose is drawn from one answer (prose.tsx).
// What stands in a flow that is not prose is drawn by the component found for it, but a
// brief standing there, a break, is a link to it: it is read where it leads.
//
// Every brief read is drawn again whenever any of them changes, all at once, so each
// drawing within keeps its place among the rest.

import { h, type Child } from "../../components/jsx.ts";
import type { Answer } from "../../engine/next/engine.ts";
import { isRecord, isRef, ref, type Value } from "../../engine/next/read/values.ts";
import { applying } from "./carried.ts";
import { arrange, note, type Realization, type Space } from "./chassis.ts";
import { block, refsOf, type Holons, type Read } from "./prose.tsx";

export const brief: Realization = (given, space) => {
  const node = (<article class="brief" />) as HTMLElement;
  const read = new Map<string, { holons?: Holons; problem?: string; stop?: () => void }>();
  let root: string | undefined;

  // Each brief reached kept read, those no longer reached let go.
  function reading(ids: Set<string>) {
    for (const [id, each] of read)
      if (!ids.has(id)) {
        each.stop?.();
        read.delete(id);
      }

    for (const id of ids) {
      if (read.has(id)) continue;
      const each: { holons?: Holons; problem?: string; stop?: () => void } = {};
      read.set(id, each);

      void space
        .subscribe(applying(space.glass, "whole", ref(id), ["brief"]), (answer) => {
          if (read.get(id) !== each) return;
          Object.assign(each, wholeOf(answer));
          draw();
        })
        .then((stop) => (read.get(id) === each ? (each.stop = stop) : stop()));
    }
  }

  function draw() {
    if (!root) return;
    const reached = new Set<string>();
    space.redraw(() => arrange(node, [section(root!, 1, reached, drawer(space))]));
    reading(reached);
  }

  // A brief at a depth: its heading, its flow, then its sections, each brief once.
  function section(id: string, depth: number, reached: Set<string>, drawn: (id: string) => Child): Node {
    reached.add(id);
    const { holons, problem } = read.get(id) ?? {};
    const brief = holons?.[id];
    if (!brief) return problem ? note(problem) : <section class="waiting" />;

    const Heading = `h${Math.min(depth, 6)}`;
    const flow = refsOf(brief.body.prose).map((inner) => {
      const holon = holons[inner];
      return block(holons, inner) ?? (holon?.types.includes("brief") ? faceOf(holon) : drawn(inner));
    });
    const parts = refsOf(brief.body.parts).filter((part) => !reached.has(part));

    return (
      <section>
        <Heading>{depth === 1 ? brief.name : <a href={`?q=@${id}`}>{brief.name}</a>}</Heading>
        {flow}
        {parts.map((part) => section(part, depth + 1, reached, drawn))}
      </section>
    );
  }

  // What stands in a flow, no prose and no brief, drawn by the component found for it,
  // each at the next index.
  function drawer(space: Space) {
    let index = 0;
    return (id: string): Child => space.draw(ref(id), index++);
  }

  function update([given = null]: Value[]) {
    if (!isRef(given)) {
      root = undefined;
      reading(new Set());
      return space.redraw(() => arrange(node, [note("What is given is no brief.")]));
    }
    if (given.$ref === root) return;
    root = given.$ref;
    reading(new Set([root]));
  }

  update(given);
  return { node, update, dispose: () => reading(new Set()) };
};

// A brief standing in another's flow: a link to it, by its name.
const faceOf = (brief: Read): Node => (
  <p class="face">
    <a class="ref" href={`?q=@${brief.id}`} data-ref={brief.id}>
      {brief.name ?? `@${brief.id}`}
    </a>
  </p>
);

// What a whole gives: its holons, or the problem it met.
function wholeOf(answer: Answer): { holons?: Holons; problem?: string } {
  if (!("value" in answer)) return { problem: answer.problem };
  const holons = isRecord(answer.value) ? (answer.value as Record<string, Value>).holons : undefined;
  return isRecord(holons)
    ? { holons: holons as unknown as Holons, problem: undefined }
    : { problem: "No store keeps this brief." };
}
