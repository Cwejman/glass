import type { Id } from "../../src/store/id.ts";
import type { HolonRead } from "../../src/engine/engine.ts";
import type { Given, Space } from "../../src/interface/component.ts";
import { h } from "./jsx.ts";
import { faceOf, isConfidence, markdown, placed, slotOf } from "./prose.ts";
import { Card, follow, Way } from "./way.tsx";

// A brief, in either kind of slot. In full: the way down to it, its title
// and prose, each part its prose places a slot where it stands, and its
// parts beneath, a list of slots; its own values it draws, and what they
// point at it opens as slots, faces unless a slot says otherwise. As a face:
// its number, title and first paragraph, and how many briefs stand beneath
// it, entered by a press. A brief's parts are numbered by where they stand;
// a record's are kept in the order of time, and are not.

export const style = `
.reader h1 .number {
  color: var(--quiet);
  font-weight: 400;
  margin-right: 0.4em;
}

.reader .status {
  font: var(--smaller) / 1 var(--sans);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--quiet);
  border: var(--hairline) solid var(--line);
  border-radius: var(--pill);
  padding: 0.3em 0.7em;
  vertical-align: middle;
  margin-left: 0.6em;
}

.reader .prose > .block:first-child > p {
  font-size: var(--lead);
}

.reader .confidence > p {
  color: var(--quiet);
  font-size: var(--aside);
}


.reader :not(pre) > code {
  font-size: var(--aside);
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

.reader .space.face {
  margin: calc(var(--gap) * 1.25) 0;
}

.reader > .space.whole {
  margin-top: calc(var(--gap) * 2.5);
}

.face-card h2 {
  font-size: var(--heading);
  line-height: var(--leading-tight);
  margin: 0 0 0.35em;
  font-weight: 600;
}

.face-card h2 .number {
  color: var(--quiet);
  font-weight: 400;
  margin-right: 0.45em;
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

// A level on the way down: a brief, its title, and its number where it has one.
interface Level {
  id: Id;
  title: string;
  number: string;
}

async function full(given: Given, space: Space) {
  const holon = given.holon!;
  const record = (await space.read({ name: "record" })) as Id | null;
  const numbers = (whole: HolonRead) => !record || !whole.instance.includes(record);

  const levels = await wayDown(holon, space, numbers);
  const number = levels.at(-1)?.number ?? "";
  const steps = levels
    .slice(0, -1)
    .map(({ id, title, number }) => ({ to: id, label: number ? `${number} ${title}` : title }));
  const parts = ((holon.body.parts ?? []) as { $ref: Id }[]).map(({ $ref }) => $ref);

  return (
    <article class="place reader" onClick={follow(space)}>
      <Way steps={steps} />
      <h1>
        {number && <span class="number">{number}</span>}
        {String(holon.body.title ?? "")}
        {holon.body.status && <span class="status">{String(holon.body.status)}</span>}
      </h1>
      <div class="prose">{proseOf(holon, space)}</div>
      {parts.length > 0 && space.openList(parts, "full", { kind: "face", numbered: numbers(holon), number })}
    </article>
  );
}

function face(given: Given, space: Space) {
  const holon = given.holon!;
  const number = (given.with as { number?: string } | null)?.number;
  const first = faceOf(String(holon.body.prose ?? ""));
  const beneath = ((holon.body.parts ?? []) as unknown[]).length;

  return (
    <Card to={holon.id} space={space} class="face-card">
      <h2>
        {number && <span class="number">{number}</span>}
        {String(holon.body.title ?? "")}
      </h2>
      {first && <p html={first} />}
      {beneath > 0 && <span class="meta">{beneath} beneath</span>}
    </Card>
  );
}

// The prose, block by block; a block that is nothing but a link into the
// field is a slot, the holon it places mounted there, as a face, or whole
// where the link says so.
function proseOf(holon: HolonRead, space: Space) {
  return markdown.lexer(String(holon.body.prose ?? "")).map((token) => {
    const slot = slotOf(token);
    if (slot) return space.open(slot.id, slot.kind);

    const kind = isConfidence(token) ? "block confidence" : "block";
    return <div class={kind} html={markdown.parser([token]) as string} />;
  });
}

// What holds a brief, and where: the whole that lists it among its parts, at
// its place there, or the whole whose prose places it by a lone link.
interface Holder {
  whole: HolonRead;
  place?: number;
}

async function holderOf(holon: HolonRead, space: Space): Promise<Holder | undefined> {
  for (const { id, key } of (await space.read({ holders: holon.id })) as { id: Id; key: string }[]) {
    const whole = await space.holon(id);
    if (!whole) continue;
    if (key === "parts")
      return {
        whole,
        place: ((whole.body.parts ?? []) as { $ref: Id }[]).findIndex((part) => part.$ref === holon.id),
      };
    if (
      key === "prose" &&
      markdown.lexer(String(whole.body.prose ?? "")).some((token) => placed(token) === holon.id)
    )
      return { whole };
  }
  return undefined;
}

// From the root down to this brief, each step numbered as the rule numbers
// it: by its place among its whole's parts, running on from the whole's own
// number while the whole is a part too, and starting again across a file.
async function wayDown(
  holon: HolonRead,
  space: Space,
  numbers: (whole: HolonRead) => boolean,
): Promise<Level[]> {
  const up: { holon: HolonRead; place?: number }[] = [];
  const seen = new Set<Id>();
  for (let at: Holder | undefined = { whole: holon }; at && !seen.has(at.whole.id); ) {
    seen.add(at.whole.id);
    const holder = await holderOf(at.whole, space);
    up.push({
      holon: at.whole,
      place: holder && holder.place !== undefined && numbers(holder.whole) ? holder.place : undefined,
    });
    at = holder;
  }
  return up.reverse().reduce<Level[]>((way, { holon, place }) => {
    const above = way.at(-1)?.number;
    const number = place === undefined ? "" : above ? `${above}.${place + 1}` : `${place + 1}`;
    return [...way, { id: holon.id, title: String(holon.body.title ?? ""), number }];
  }, []);
}
