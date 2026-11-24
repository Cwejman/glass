// A brief: its name, its flow, and its sections read through after it, each a heading
// leading to it, then the flow and sections of its own. The brief is read in one read,
// live, by sections: the wholes of it and of each section, entering no brief standing in
// a flow, so it is drawn from one answer (prose.tsx). What stands in a flow that is not
// prose is drawn by the component found for it, but a brief standing there is a card
// leading to it: it is read where it leads.
//
// The brief is drawn again whenever its answer changes, all at once, so each drawing
// within keeps its place among the rest. Given another brief, it is made anew, and the
// chassis keeps the one shown until the new one is read.
//
// The reader says where a brief stands, so a brief says nothing of what holds it.

import { hrefTo } from "../../chassis/web/href.ts";
import { h, type Child } from "./jsx.ts";
import { isRecord, isRef, ref, type Value } from "../../engine/read/values.ts";
import { q } from "../../language/shipped.ts";
import type { IO, Realization } from "../../chassis/web/chassis.ts";
import { block, refsOf, type Holons, type Read } from "./prose.tsx";
import { cardOf } from "./value.tsx";

export const brief: Realization = ([given = null], io) => {
  if (!isRef(given)) return <article class="brief">{noted("What is given is no brief.")}</article>;

  // The brief and all it holds in one read, sections: the brief and each brief it holds
  // as a section, each a whole entering no brief, so a brief standing in a flow is read
  // but not entered.
  const wholes = io.read(q`sections(${given})`);
  return (
    <article class="brief">
      {wholes === undefined ? null : section(holonsOf(wholes), given.$ref, 1, new Set(), drawer(io), io)}
    </article>
  );
};

// A brief at a depth: its heading, its flow, then its sections, each brief once.
function section(
  holons: Holons,
  id: string,
  depth: number,
  reached: Set<string>,
  drawn: (id: string) => Child,
  io: IO,
): Node {
  reached.add(id);
  const brief = holons[id];
  if (!brief) return noted("No store keeps this brief.");

  const Heading = `h${Math.min(depth, 6)}`;
  const flow = refsOf(brief.body.prose).map((inner) => {
    const holon = holons[inner];
    return block(holons, inner) ?? (holon?.types.includes("brief") ? faceOf(holon, io) : drawn(inner));
  });
  const parts = refsOf(brief.body.parts).filter((part) => !reached.has(part));

  return (
    <section>
      <Heading>{depth === 1 ? brief.name : <a href={hrefTo(id)}>{brief.name}</a>}</Heading>
      {flow}
      {parts.map((part) => section(holons, part, depth + 1, reached, drawn, io))}
    </section>
  );
}

// What stands in a flow, no prose and no brief, drawn by the component found for it,
// each at the next index.
function drawer(io: IO) {
  let index = 0;
  return (id: string): Child => io.draw(ref(id), index++);
}

const noted = (text: string) => <p class="note">{text}</p>;

// A brief standing in another's flow: a card leading to it, by its name, saying its
// first paragraph once read.
const faceOf = (brief: Read, io: IO): Node => (
  <div class="face">{cardOf(io, brief.id, brief.name ?? `@${brief.id}`)}</div>
);

// What sections gives, the holons of every whole, as one.
function holonsOf(wholes: Value): Holons {
  const held = (Array.isArray(wholes) ? wholes : []).flatMap((whole) => {
    const holons = isRecord(whole) ? (whole as Record<string, Value>).holons : undefined;
    return isRecord(holons) ? [holons] : [];
  });
  return Object.assign({}, ...held) as unknown as Holons;
}
