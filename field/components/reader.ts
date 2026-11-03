import type { Id } from "../../src/store/id.ts";
import type { HolonRead } from "../../src/engine/engine.ts";
import type { Given, Space } from "../../src/interface/interface.ts";
import { element, isConfidence, markdown, placed } from "./prose.ts";

// A brief whole, read along the gradient: the way down to it, its prose with
// the parts it places by lone links, and then the briefs beneath it in
// order, each by its face. Entering a part, or any link into the field,
// places the reader there. A brief's parts are numbered by where they stand;
// a record's are kept in the order of time, and are not.

export const style = `
.reader nav { font: var(--small) / var(--leading-close) var(--sans); color: var(--quiet); margin-bottom: calc(var(--gap) * 2.5); }
.reader nav a { color: inherit; text-decoration: none; }
.reader nav a:hover { color: var(--ink); }
.reader nav .step + .step::before { content: "›"; margin: 0 0.5em; opacity: 0.6; }
.reader h1 { font-size: var(--title); line-height: var(--leading-tight); font-weight: 600; margin: 0 0 calc(var(--gap) * 1.25); letter-spacing: -0.01em; }
.reader h1 .number { color: var(--quiet); font-weight: 400; margin-right: 0.4em; }
.reader .status { font: var(--smaller) / 1 var(--sans); text-transform: uppercase; letter-spacing: 0.06em; color: var(--quiet);
  border: var(--hairline) solid var(--line); border-radius: var(--pill); padding: 0.3em 0.7em; vertical-align: middle; margin-left: 0.6em; }
.reader .prose > p:first-child { font-size: var(--lead); }
.reader .confidence { color: var(--quiet); font-size: var(--aside); }
.reader pre { background: var(--raised); border: var(--hairline) solid var(--line); border-radius: var(--radius); padding: var(--inset);
  overflow-x: auto; font-size: var(--code); line-height: var(--leading-close); }
.reader :not(pre) > code { font-size: var(--aside); }
.reader blockquote { margin: var(--gap) 0; padding-left: var(--gap); border-left: var(--rule) solid var(--line); color: var(--quiet); }
.reader .unlinked { border-bottom: var(--hairline) dotted var(--quiet); cursor: help; }
.reader .parts { list-style: none; padding: 0; margin: calc(var(--gap) * 2.5) 0 0; display: grid; gap: calc(var(--gap) * 0.75); }
.reader .space.face { margin: calc(var(--gap) * 1.25) 0; }
`;

interface Step {
  id: Id;
  title: string;
  number: string;
}

export default async function draw({ holon }: Given, space: Space) {
  const article = element("article", "reader");
  const record = (await space.read({ name: "record" })) as Id | null;
  const numbers = (whole: HolonRead) => !record || !whole.instance.includes(record);
  const way = await wayDown(holon, space, numbers);
  const number = way.at(-1)?.number ?? "";

  if (way.length > 1) {
    const nav = element("nav");
    for (const step of way.slice(0, -1)) {
      const link = element("a", "step", `${step.number ? step.number + " " : ""}${step.title}`);
      link.href = "#";
      link.dataset.ref = step.id;
      nav.append(link);
    }
    article.append(nav);
  }

  const title = element("h1");
  if (number) title.append(element("span", "number", number));
  title.append(String(holon.body.title ?? ""));
  if (holon.body.status) title.append(element("span", "status", String(holon.body.status)));
  article.append(title);

  const prose = element("div", "prose");
  for (const token of markdown.lexer(String(holon.body.prose ?? ""))) {
    const part = placed(token);
    if (part) prose.append(space.open(part, "face"));
    else {
      const block = document.createElement("template");
      block.innerHTML = markdown.parser([token]) as string;
      if (isConfidence(token)) block.content.firstElementChild?.classList.add("confidence");
      prose.append(block.content);
    }
  }
  article.append(prose);

  const parts = (holon.body.parts ?? []) as { $ref: Id }[];
  if (parts.length) {
    const list = element("ol", "parts");
    parts.forEach((part, i) => {
      const item = element("li");
      const at = numbers(holon) ? (number ? `${number}.${i + 1}` : `${i + 1}`) : null;
      item.append(space.open(part.$ref, "face", at ? { number: at } : null));
      list.append(item);
    });
    article.append(list);
  }

  article.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLElement>("a[data-ref]");
    if (!link) return;
    event.preventDefault();
    void space.place(link.dataset.ref!);
  });
  return article;
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
      return { whole, place: ((whole.body.parts ?? []) as { $ref: Id }[]).findIndex((part) => part.$ref === holon.id) };
    if (key === "prose" && markdown.lexer(String(whole.body.prose ?? "")).some((token) => placed(token) === holon.id))
      return { whole };
  }
  return undefined;
}

// From the root down to this brief, each step numbered as the rule numbers
// it: by its place among its whole's parts, running on from the whole's own
// number while the whole is a part too, and starting again across a file.
async function wayDown(holon: HolonRead, space: Space, numbers: (whole: HolonRead) => boolean): Promise<Step[]> {
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
