import type { Id } from "../../src/store/id.ts";
import type { HolonRead } from "../../src/engine/engine.ts";
import type { Given, Space } from "../../src/interface/component.ts";
import { element } from "./element.ts";
import { isConfidence, markdown, placed } from "./prose.ts";
import { follow, way } from "./way.ts";

// A brief whole, read along the gradient: the way down to it, its title and
// prose, each part its prose places by a lone link mounted where it stands,
// and its parts beneath as a list of mounts. Its own values it draws; what
// they point at, it mounts. A brief's parts are numbered by where they
// stand; a record's are kept in the order of time, and are not.

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

.reader .prose > p:first-child {
  font-size: var(--lead);
}

.reader .confidence {
  color: var(--quiet);
  font-size: var(--aside);
}

.reader pre {
  background: var(--raised);
  border: var(--hairline) solid var(--line);
  border-radius: var(--radius);
  padding: var(--inset);
  overflow-x: auto;
  font-size: var(--code);
  line-height: var(--leading-close);
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
`;

interface Step {
  id: Id;
  title: string;
  number: string;
}

export default async function draw(given: Given, space: Space) {
  const holon = given.holon!;
  const article = element("article", "place reader");

  const record = (await space.read({ name: "record" })) as Id | null;
  const numbers = (whole: HolonRead) => !record || !whole.instance.includes(record);
  const steps = await wayDown(holon, space, numbers);
  const number = steps.at(-1)?.number ?? "";

  article.append(
    way(
      steps
        .slice(0, -1)
        .map(({ id, title, number }) => ({ to: id, label: number ? `${number} ${title}` : title })),
    ),
  );
  article.append(titleOf(holon, number));
  article.append(proseOf(holon, space));

  const parts = ((holon.body.parts ?? []) as { $ref: Id }[]).map(({ $ref }) => $ref);
  if (parts.length)
    article.append(space.openList(parts, "whole", { draws: "face", numbered: numbers(holon), number }));

  follow(article, space);
  return article;
}

function titleOf(holon: HolonRead, number: string) {
  const title = element("h1");
  if (number) title.append(element("span", "number", number));
  title.append(String(holon.body.title ?? ""));
  if (holon.body.status) title.append(element("span", "status", String(holon.body.status)));
  return title;
}

// The prose, block by block; a block that is nothing but a link into the
// field places that part there, mounted as its face.
function proseOf(holon: HolonRead, space: Space) {
  const prose = element("div", "prose");
  for (const token of markdown.lexer(String(holon.body.prose ?? ""))) {
    const part = placed(token);
    if (part) {
      prose.append(space.open(part, "face"));
      continue;
    }
    const block = document.createElement("template");
    block.innerHTML = markdown.parser([token]) as string;
    if (isConfidence(token)) block.content.firstElementChild?.classList.add("confidence");
    prose.append(block.content);
  }
  return prose;
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
): Promise<Step[]> {
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
  return up.reverse().reduce<Step[]>((way, { holon, place }) => {
    const above = way.at(-1)?.number;
    const number = place === undefined ? "" : above ? `${above}.${place + 1}` : `${place + 1}`;
    return [...way, { id: holon.id, title: String(holon.body.title ?? ""), number }];
  }, []);
}
