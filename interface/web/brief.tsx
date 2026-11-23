// A brief: its name, its flow, and its sections read through after it, each a heading
// leading to it, then the flow and sections of its own. The brief is read in one read,
// live, by sections: the wholes of it and of each section, entering no brief standing in
// a flow, so it is drawn from one answer (prose.tsx).
// What stands in a flow that is not prose is drawn by the component found for it, but a
// brief standing there, a break, is a link to it: it is read where it leads.
//
// The brief is drawn again whenever its answer changes, all at once, so each drawing
// within keeps its place among the rest. Given another brief, what is shown is kept until
// the new one is read, or until waiting has been long enough, so moving between briefs
// never blanks the page nor grows it piece by piece.
//
// The reader says where a brief stands, so a brief says nothing of what holds it.

import { h, type Child } from "./jsx.ts";
import type { Answer } from "../../engine/engine.ts";
import { isRecord, isRef, ref, type Value } from "../../engine/read/values.ts";
import { applying } from "./carried.ts";
import { arrange, awaiting, note, type Realization, type Space } from "./chassis.ts";
import { block, refsOf, type Holons, type Read } from "./prose.tsx";
import { cardOf, named } from "./value.tsx";

export const brief: Realization = (given, space) => {
  const node = (<article class="brief" />) as HTMLElement;
  let root: string | undefined;
  // The read of the brief given, and the one drawn last, kept until the next is drawn.
  let reading: Reading | undefined;
  let shown: Reading | undefined;
  let lateness: ReturnType<typeof setTimeout> | undefined;
  let done = () => {};

  // The brief and all it holds in one read, sections: the brief and each brief it holds
  // as a section, each a whole entering no brief, so a brief standing in a flow is read
  // but not entered, and draws as a link.
  function read(id: string) {
    reading?.stop?.();
    const each: Reading = {};
    reading = each;

    void space
      .subscribe(applying(space.glass, "sections", ref(id)), (answer) => {
        // A store changing answers every read again; one answered as it was is not drawn
        // again.
        const said = JSON.stringify("value" in answer ? answer.value : answer.problem);
        if (reading !== each || said === each.said) return;
        Object.assign(each, wholeOf(answer), { said });
        draw(each);
      })
      .then((stop) => (reading === each ? (each.stop = stop) : stop()));
  }

  function draw(from: Reading) {
    if (!root) return;
    shown = from;
    // Drawn, it waits no longer: what was late is over.
    clearTimeout(lateness);
    done();
    const drawn = section(from, root, 1, new Set(), drawer(space));
    void named(drawn, space, ".face a[data-row]");
    space.redraw(() => arrange(node, [drawn]));
  }

  // A brief at a depth: its heading, its flow, then its sections, each brief once.
  function section(
    from: Reading,
    id: string,
    depth: number,
    reached: Set<string>,
    drawn: (id: string) => Child,
  ): Node {
    reached.add(id);
    const { holons, problem } = from;
    const brief = holons?.[id];
    if (problem) return note(problem);
    if (!brief) return holons ? note("No store keeps this brief.") : <section class="waiting" />;

    const Heading = `h${Math.min(depth, 6)}`;
    const flow = refsOf(brief.body.prose).map((inner) => {
      const holon = holons![inner];
      return block(holons!, inner) ?? (holon?.types.includes("brief") ? faceOf(holon) : drawn(inner));
    });
    const parts = refsOf(brief.body.parts).filter((part) => !reached.has(part));

    return (
      <section>
        <Heading>{depth === 1 ? brief.name : <a href={`?q=@${id}`}>{brief.name}</a>}</Heading>
        {flow}
        {parts.map((part) => section(from, part, depth + 1, reached, drawn))}
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
      reading?.stop?.();
      reading = undefined;
      return space.redraw(() => arrange(node, [note("What is given is no brief.")]));
    }
    if (given.$ref === root) return;
    root = given.$ref;
    clearTimeout(lateness);
    done();
    read(root);
    // A section of the brief shown is read already, all it holds with it: drawn at once.
    if (shown && entered(shown, root)) return draw(shown);
    // Else what is shown stays until the new brief is read, or waiting has been enough.
    done = awaiting(node);
    lateness = setTimeout(() => reading && draw(reading), 2000);
  }

  update(given);
  return {
    node,
    update,
    dispose: () => {
      clearTimeout(lateness);
      done();
      reading?.stop?.();
    },
  };
};

// Whether a read holds a brief entered, its flow and its sections with it.
function entered({ holons }: Reading, id: string, seen = new Set<string>()): boolean {
  const brief = holons?.[id];
  if (seen.has(id)) return true;
  seen.add(id);
  return Boolean(
    brief &&
      [...refsOf(brief.body.prose), ...refsOf(brief.body.parts)].every((inner) => holons![inner]) &&
      refsOf(brief.body.parts).every((part) => entered({ holons }, part, seen)),
  );
}

// A brief as it is read: what its whole gives, or the problem it met, as last answered.
type Reading = { holons?: Holons; problem?: string; said?: string; stop?: () => void };

// A brief standing in another's flow: a card leading to it, by its name, saying its
// first paragraph once read.
const faceOf = (brief: Read): Node => (
  <div class="face">{cardOf(brief.id, brief.name ?? `@${brief.id}`)}</div>
);

// What sections gives: the holons of every whole, or the problem it met. A brief no
// store keeps is said where it would stand (section).
function wholeOf(answer: Answer): { holons?: Holons; problem?: string } {
  if (!("value" in answer)) return { problem: answer.problem };
  const wholes = Array.isArray(answer.value) ? answer.value : [];
  const held = wholes.flatMap((whole) => {
    const holons = isRecord(whole) ? (whole as Record<string, Value>).holons : undefined;
    return isRecord(holons) ? [holons] : [];
  });
  return { holons: Object.assign({}, ...held) as unknown as Holons, problem: undefined };
}
