// A brief, in either kind of slot. In full: the way down to it, its name, its flow,
// and its sections read through after it, each with the flow of its own. What stands
// in a flow that is not prose, a brief mounted there among them, shows its face in a
// slot of its own. As a face: its name and its first paragraph.

import type { HolonRead } from "../../engine/reads.ts";
import type { Given, Space } from "../../interface/component.ts";
import { h, type Child } from "./jsx.ts";
import { block, refsOf } from "./prose.tsx";

export const declared = {
  name: "Brief",
  says: "A brief: in full, the way down to it, its name and flow, and its sections read through after it; as a face, its name and first paragraph.",
  takes: ["brief"],
  kinds: ["full", "face"],
  reads: ["whole", "holders", "holon"],
};

export const style = `
.reader section {
  margin-top: calc(var(--gap) * 2);
}

.reader h2,
.reader h3,
.reader h4 {
  line-height: var(--leading-tight);
  font-weight: 600;
}

.reader .section-link {
  color: inherit;
  text-decoration: none;
}

.reader .section-link:hover {
  text-decoration: underline;
}

.reader blockquote {
  margin: var(--gap) 0;
  padding-left: var(--gap);
  border-left: var(--rule) solid var(--line);
  color: var(--quiet);
}

.reader .unlinked {
  border-bottom: var(--hairline) dotted var(--quiet);
  cursor: help;
}

.reader .slot.face {
  margin: calc(var(--gap) * 1.25) 0;
}

.face-card h2 {
  font-size: var(--heading);
  line-height: var(--leading-tight);
  margin: 0 0 0.35em;
  font-weight: 600;
}

.face-card p {
  margin: 0;
  color: var(--quiet);
  font-size: var(--aside);
  line-height: var(--leading-close);
}
`;

export default function draw(given: Given, space: Space) {
  return given.kind === "face" ? face(given, space) : full(given, space);
}

const untilBriefs = (space: Space, id: string) => space.read({ whole: id, stop: ["brief"] });

async function full(given: Given, space: Space) {
  const brief = given.holon as HolonRead;
  const way = (<nav aria-label="Where this stands" />) as HTMLElement;

  // The way down asks about everything, so the words do not wait for it.
  wayDown(brief, space).then(
    (steps) =>
      way.replaceChildren(
        ...steps.map(
          ({ id, name }) =>
            (
              <a href="#" data-location={JSON.stringify([id])}>
                {name}
              </a>
            ) as Node,
        ),
      ),
    () => undefined,
  );

  return (
    <article class="place reader">
      {way}
      <h1>{brief.name}</h1>
      {await flowAndSections(brief, space, 2, new Set([brief.id]))}
    </article>
  );
}

// A brief's flow, what is not prose shown by its face, and its sections read through.
async function flowAndSections(
  brief: HolonRead,
  space: Space,
  depth: number,
  seen: Set<string>,
): Promise<Child> {
  const { holons } = await untilBriefs(space, brief.id);

  const flow = refsOf(brief.body.prose).map(
    (id) => block(holons, id) ?? space.open(id, { offer: { kind: "face" } }),
  );

  const sections = await Promise.all(
    refsOf(brief.body.parts).flatMap((id) => {
      const section = holons[id];

      // A brief that holds itself is read through once.
      if (!section || seen.has(id)) return [];
      seen.add(id);

      return [sectionOf(section, space, depth, seen)];
    }),
  );

  return [flow, sections];
}

async function sectionOf(section: HolonRead, space: Space, depth: number, seen: Set<string>) {
  const Heading = `h${Math.min(depth, 6)}`;

  return (
    <section>
      <Heading>
        <a href="#" class="section-link" data-location={JSON.stringify([section.id])}>
          {section.name}
        </a>
      </Heading>
      {await flowAndSections(section, space, depth + 1, seen)}
    </section>
  );
}

async function face({ holon }: Given, space: Space) {
  const brief = holon as HolonRead;
  const firstId = refsOf(brief.body.prose)[0];
  const first = firstId ? (await space.read({ whole: firstId })).holons : {};

  return (
    <div class="card face-card">
      <h2>{brief.name}</h2>
      {firstId && first[firstId]?.types.includes("paragraph") && block(first, firstId)}
    </div>
  );
}

// From the top of its holarchy down to this brief, by what holds each.
async function wayDown(brief: HolonRead, space: Space) {
  const steps: { id: string; name: string }[] = [];
  const seen = new Set([brief.id]);

  for (let id = brief.id; ; ) {
    const holder = (await space.read({ holders: id })).find(({ holds }) => holds);

    if (!holder || seen.has(holder.from)) return steps;

    const whole = await space.holon(holder.from);
    if (!whole) return steps;

    steps.unshift({ id: whole.id, name: whole.name ?? "…" });
    seen.add(whole.id);
    id = whole.id;
  }
}
