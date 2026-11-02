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
.reader nav { font: var(--small) / 1.5 var(--sans); color: var(--quiet); margin-bottom: calc(var(--gap) * 2.5); }
.reader nav a { color: inherit; text-decoration: none; }
.reader nav a:hover { color: var(--ink); }
.reader nav .step + .step::before { content: "›"; margin: 0 0.5em; opacity: 0.6; }
.reader h1 { font-size: var(--title); line-height: 1.2; font-weight: 600; margin: 0 0 calc(var(--gap) * 1.25); letter-spacing: -0.01em; }
.reader h1 .number { color: var(--quiet); font-weight: 400; margin-right: 0.4em; }
.reader .status { font: var(--smaller) / 1 var(--sans); text-transform: uppercase; letter-spacing: 0.06em; color: var(--quiet);
  border: 1px solid var(--line); border-radius: 99px; padding: 0.3em 0.7em; vertical-align: middle; margin-left: 0.6em; }
.reader .prose > p:first-child { font-size: var(--lead); }
.reader .confidence { color: var(--quiet); font-size: 0.9em; }
.reader pre { background: var(--raised); border: 1px solid var(--line); border-radius: var(--radius); padding: 0.8em 1em;
  overflow-x: auto; font-size: 0.8em; line-height: 1.5; }
.reader code { font-size: 0.88em; }
.reader blockquote { margin: var(--gap) 0; padding-left: var(--gap); border-left: 3px solid var(--line); color: var(--quiet); }
.reader .unlinked { border-bottom: 1px dotted var(--quiet); cursor: help; }
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

// From the root down to this brief: up through whatever holds it, as a part
// or by a lone link, and numbered within its file as the rule numbers it.
async function wayDown(holon: HolonRead, space: Space, numbers: (whole: HolonRead) => boolean): Promise<Step[]> {
  const way: Step[] = [];
  const seen = new Set<Id>();
  let current: HolonRead | null = holon;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const holders = (await space.read({ holders: current.id })) as { id: Id; key: string }[];
    let parent: HolonRead | null = null;
    let index = -1;
    for (const holder of holders) {
      const read = (await space.read({ holon: holder.id })) as unknown as HolonRead | null;
      if (!read) continue;
      if (holder.key === "parts") {
        index = ((read.body.parts ?? []) as { $ref: Id }[]).findIndex((part) => part.$ref === current!.id);
        parent = read;
        break;
      }
      if (holder.key === "prose" && placesById(String(read.body.prose ?? ""), current.id)) {
        parent = read;
        break;
      }
    }
    const numbered = index >= 0 && parent !== null && numbers(parent);
    way.unshift({ id: current.id, title: String(current.body.title ?? ""), number: numbered ? `${index + 1}` : "" });
    current = parent;
  }
  // A number runs on from its parent's while the parent is a part too.
  for (let i = 1; i < way.length; i++)
    if (way[i]!.number && way[i - 1]!.number) way[i]!.number = `${way[i - 1]!.number}.${way[i]!.number}`;
  return way;
}

function placesById(prose: string, id: Id) {
  return markdown.lexer(prose).some((token) => placed(token) === id);
}
