// A brief: its name, its flow, and its sections read through after it, each a heading
// leading to it, then the flow and sections of its own. Each brief is read as a whole
// that enters no brief within it, live, so its prose is drawn from one answer (prose.tsx).
// What stands in a flow that is not prose is drawn by the component found for it, but a
// brief standing there, a break, is a link to it: it is read where it leads. The brief
// read opens with its first paragraph as its lede.
//
// Every brief read is drawn again whenever any of them changes, all at once, so each
// drawing within keeps its place among the rest. Given another brief, what is shown is
// kept until the new one and its sections are read, or until waiting has been long
// enough, so moving between briefs never blanks the page nor grows it piece by piece.
//
// The reader says where a brief stands, so a brief says nothing of what holds it.

import { h, type Child } from "../../components/jsx.ts";
import type { Answer } from "../../engine/next/engine.ts";
import { isRecord, isRef, ref, type Value } from "../../engine/next/read/values.ts";
import { applying } from "./carried.ts";
import { arrange, awaiting, note, type Realization, type Space } from "./chassis.ts";
import { block, refsOf, type Holons, type Read } from "./prose.tsx";
import { cardOf, named } from "./value.tsx";

export const brief: Realization = (given, space) => {
  const node = (<article class="brief" />) as HTMLElement;
  const read = new Map<string, Reading>();
  let root: string | undefined;
  // The brief drawn last, and whether waiting for the one given since has been enough.
  let drawnRoot: string | undefined;
  let late = false;
  let lateness: ReturnType<typeof setTimeout> | undefined;
  let done = () => {};

  // Each brief reached kept read, those no longer reached let go.
  function reading(ids: Set<string>) {
    for (const [id, each] of read)
      if (!ids.has(id)) {
        each.stop?.();
        read.delete(id);
      }

    for (const id of ids) {
      if (read.has(id)) continue;
      const each: Reading = {};
      read.set(id, each);

      void space
        .subscribe(applying(space.glass, "whole", ref(id), null, ["brief"]), (answer) => {
          // A store changing answers every read again; one answered as it was is not
          // drawn again.
          const said = JSON.stringify("value" in answer ? answer.value : answer.problem);
          if (read.get(id) !== each || said === each.said) return;
          Object.assign(each, wholeOf(answer), { said });
          draw();
        })
        .then((stop) => (read.get(id) === each ? (each.stop = stop) : stop()));
    }
  }

  // The briefs reached from the root so far, and whether each of them is read.
  function reachable(id: string, reached = new Set<string>()): { reached: Set<string>; read: boolean } {
    reached.add(id);
    const { holons, problem } = read.get(id) ?? {};
    if (problem !== undefined) return { reached, read: true };
    const brief = holons?.[id];
    if (!brief) return { reached, read: false };
    let all = true;
    for (const part of refsOf(brief.body.parts))
      if (!reached.has(part)) all = reachable(part, reached).read && all;
    return { reached, read: all };
  }

  function draw() {
    if (!root) return;
    if (root !== drawnRoot && !late) {
      const { reached, read: ready } = reachable(root);
      if (!ready) return reading(reached);
    }
    drawnRoot = root;
    done();
    const reached = new Set<string>();
    const drawn = section(root!, 1, reached, drawer(space));
    void named(drawn, space, ".face a[data-row]");
    space.redraw(() => arrange(node, [drawn]));
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
    const [first] = flow;
    if (depth === 1 && first instanceof HTMLParagraphElement) first.classList.add("lede");

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
    late = false;
    clearTimeout(lateness);
    done();
    done = awaiting(node);
    lateness = setTimeout(() => {
      late = true;
      draw();
    }, 2000);
    reading(new Set([root]));
    // A brief already read, as a section of the one shown, is drawn without waiting on it.
    if (read.get(root)?.holons) draw();
  }

  update(given);
  return {
    node,
    update,
    dispose: () => {
      clearTimeout(lateness);
      done();
      reading(new Set());
    },
  };
};

// A brief as it is read: what its whole gives, or the problem it met, as last answered.
type Reading = { holons?: Holons; problem?: string; said?: string; stop?: () => void };

// A brief standing in another's flow: a card leading to it, by its name, saying its
// first paragraph once read.
const faceOf = (brief: Read): Node => (
  <div class="face">{cardOf(brief.id, brief.name ?? `@${brief.id}`)}</div>
);

// What a whole gives: its holons, or the problem it met.
function wholeOf(answer: Answer): { holons?: Holons; problem?: string } {
  if (!("value" in answer)) return { problem: answer.problem };
  const holons = isRecord(answer.value) ? (answer.value as Record<string, Value>).holons : undefined;
  return isRecord(holons)
    ? { holons: holons as unknown as Holons, problem: undefined }
    : { problem: "No store keeps this brief." };
}
