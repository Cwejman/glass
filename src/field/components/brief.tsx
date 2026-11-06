import type { Id } from "../../store/id.ts";
import type { Declaration, Given, HolonOf, Space } from "../../interface/component.ts";
import type { BriefBody, BriefSettings } from "./bodies.ts";
import { h } from "./jsx.ts";
import { faceOf, isConfidence, markdown, placed, slotOf } from "./prose.ts";
import { Way } from "./way.tsx";

// A brief, in either kind of slot. In full: the way down to it, its title
// and prose, each part its prose places a slot where it stands, and its
// parts beneath, a slot of them all; its own values it draws, and what they
// point at it opens as slots, offering them a face, so a brief in full
// never trickles its fullness into what it holds. As a face: its number,
// title and first paragraph, and how many briefs stand beneath it. A
// brief's parts are numbered by where they stand, unless it keeps them by
// time, as a day's words are.

export const declared = {
  title: "Brief",
  says: "A brief: in full, the way down to it, its title and prose, the parts its prose places and its parts beneath, each a slot; as a face, its number, title and first paragraph.",
  takes: ["brief"],
  kinds: ["full", "face"],
  settings: {
    number: {
      says: "Its number where it stands among its whole's parts, as 2.3, drawn before its title as a face.",
      shape: "string",
      optional: true,
    },
  },
  reads: ["holders", "holon"],
} satisfies Declaration;

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

.reader .slot.face {
  margin: calc(var(--gap) * 1.25) 0;
}

.reader > .slot.full {
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

type Drawn = Given<BriefBody, BriefSettings>;

export default function draw(given: Drawn, space: Space) {
  return given.kind === "face" ? face(given) : full(given, space);
}

// A level on the way down: a brief, its title, and its number where it has one.
interface Level {
  id: Id;
  title: string;
  number: string;
}

async function full(given: Drawn, space: Space) {
  const holon = given.holon!;
  const brief = holon.body;
  const numbers = (whole: HolonOf<BriefBody>) => whole.body.kept !== "time";

  const levels = await wayDown(holon, space, numbers);
  const number = levels.at(-1)?.number ?? "";
  const steps = levels
    .slice(0, -1)
    .map(({ id, title, number }) => ({ to: id, label: number ? `${number} ${title}` : title }));

  return (
    <article class="place reader">
      <Way steps={steps} />
      <h1>
        {number && <span class="number">{number}</span>}
        {brief.title}
        {brief.status && <span class="status">{brief.status}</span>}
      </h1>
      <div class="prose">{proseOf(holon, space)}</div>
      {(brief.parts?.length ?? 0) > 0 &&
        space.open(
          brief.parts!.map(({ $ref }) => $ref),
          { offer: { kind: "face" }, settings: { numbered: numbers(holon), number } },
        )}
    </article>
  );
}

function face(given: Drawn) {
  const holon = given.holon!;
  const brief = holon.body;
  const { number } = given.settings;
  const first = faceOf(brief.prose);
  const beneath = brief.parts?.length ?? 0;

  return (
    <div class="card face-card">
      <h2>
        {number && <span class="number">{number}</span>}
        {brief.title}
      </h2>
      {first && <p html={first} />}
      {beneath > 0 && <span class="meta">{beneath} beneath</span>}
    </div>
  );
}

// The prose, block by block; a block that is nothing but a link into the
// field is a slot, the holon it places mounted there, offered a face, or
// in full where the link itself says so.
function proseOf(holon: HolonOf<BriefBody>, space: Space) {
  return markdown.lexer(holon.body.prose).map((token) => {
    const slot = slotOf(token);
    if (slot)
      return space.open(slot.id, {
        offer: { kind: "face" },
        ...(slot.kind === "full" ? { kind: "full" } : {}),
      });

    const kind = isConfidence(token) ? "block confidence" : "block";
    return <div class={kind} html={markdown.parser([token]) as string} />;
  });
}

// What holds a brief, and where: the whole that lists it among its parts, at
// its place there, or the whole whose prose places it by a lone link.
interface Holder {
  whole: HolonOf<BriefBody>;
  place?: number;
}

async function holderOf(holon: HolonOf<BriefBody>, space: Space): Promise<Holder | undefined> {
  for (const { id, key } of await space.read({ holders: holon.id })) {
    const whole = await space.holon<BriefBody>(id);
    if (!whole) continue;
    if (key === "parts")
      return { whole, place: (whole.body.parts ?? []).findIndex(({ $ref }) => $ref === holon.id) };
    if (key === "prose" && markdown.lexer(whole.body.prose).some((token) => placed(token) === holon.id))
      return { whole };
  }
  return undefined;
}

// From the root down to this brief, each step numbered as the rule numbers
// it: by its place among its whole's parts, running on from the whole's own
// number while the whole is a part too, and starting again across a file.
async function wayDown(
  holon: HolonOf<BriefBody>,
  space: Space,
  numbers: (whole: HolonOf<BriefBody>) => boolean,
): Promise<Level[]> {
  const up: { holon: HolonOf<BriefBody>; place?: number }[] = [];
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
    return [...way, { id: holon.id, title: holon.body.title, number }];
  }, []);
}
