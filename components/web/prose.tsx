// Prose drawn from its holons, as the native whole gives them. A paragraph holds its text
// as runs: text as written, its marks within it, *emphasis*, **strong**, `code` and links
// to the web, and holons lifted out of it and held in place where something points at a
// part alone, a sentence or a link into the field. The runs are read as one text, each
// holon standing in it where it is held, so a mark may reach across one. Nothing here is
// drawn by a component of its own, so a long brief is one drawing. What is not prose,
// standing in a flow, is left to whoever draws the flow.

import { hrefTo } from "./link.ts";
import { h, type Child } from "./jsx.ts";

// A holon as the native whole gives it: its body as it is kept, and its types' names.
export type Read = { id: string; name?: string; types: string[]; body: Record<string, any> };
export type Holons = Readonly<Record<string, Read>>;

export const refsOf = (list: unknown) =>
  (Array.isArray(list) ? list : []).flatMap((each) =>
    each !== null && typeof each === "object" && typeof each.$ref === "string" ? [each.$ref as string] : [],
  );

// A holon held among the runs stands in their one text as one character of its own.
const first = 0xe000;
const standing = (i: number) => String.fromCharCode(first + i);

// A link that leads into the field is a link to it in this page; one to the web stays a
// link. An image is not fetched: loading it would tell whoever serves it who reads, and
// when.
function linked(to: { leads?: string; to?: string; image?: boolean }, words: Child[], id?: string): Node {
  if (to.leads)
    return (
      <a class="ref" href={hrefTo(to.leads)} data-ref={to.leads} {...(id ? { "data-holon": id } : {})}>
        {words}
      </a>
    );
  if (!to.image && /^(https?|mailto):/i.test(to.to ?? "")) return <a href={to.to}>{words}</a>;

  return (
    <span class="unlinked" title={to.to}>
      {words}
    </span>
  );
}

// Marked text as drawn, each holon standing in it drawn by stand.
function marked(text: string, stand: (i: number) => Child): Child[] {
  const out: Child[] = [];
  let plain = "";
  const flush = () => {
    if (plain) out.push(plain);
    plain = "";
  };

  for (let at = 0; at < text.length; ) {
    const rest = text.slice(at);
    const code = text.charCodeAt(at);

    if (rest[0] === "\\" && rest.length > 1) {
      plain += rest[1];
      at += 2;
      continue;
    }
    if (code >= first && code < first + 0x1000) {
      flush();
      out.push(stand(code - first));
      at += 1;
      continue;
    }

    const span =
      /^`([^`]*)`/.exec(rest) ??
      /^\*\*((?:\\.|[^\\*])+)\*\*/.exec(rest) ??
      /^\*((?:\\.|[^\\*])+)\*/.exec(rest) ??
      /^(!?)\[((?:\\.|[^\\\]])*)\]\(([^)\s]*)\)/.exec(rest);

    if (!span) {
      plain += rest[0];
      at += 1;
      continue;
    }

    flush();
    const whole = span[0];
    if (whole.startsWith("`")) out.push(<code>{span[1]}</code>);
    else if (whole.startsWith("**")) out.push(<strong>{marked(span[1]!, stand)}</strong>);
    else if (whole.startsWith("*")) out.push(<em>{marked(span[1]!, stand)}</em>);
    else out.push(linked({ to: span[3], image: span[1] === "!" }, marked(span[2]!, stand)));
    at += whole.length;
  }

  flush();
  return out;
}

// A holon's runs, drawn: its text and the holons held in it.
export function inline(holons: Holons, id: string): Child {
  const holon = holons[id];
  if (!holon) return null;
  return runs(holons, holon.body.text);
}

function runs(holons: Holons, list: unknown): Child[] {
  const items = Array.isArray(list) ? list : [];
  const held: string[] = [];
  const text = items
    .map((run) => {
      if (typeof run === "string") return run;
      if (run && typeof run.$ref === "string") return standing(held.push(run.$ref) - 1);
      return "";
    })
    .join("");

  return marked(text, (i) => {
    const id = held[i]!;
    const holon = holons[id];
    if (!holon) return null;
    const inner = runs(holons, holon.body.text);
    if (holon.types.includes("link"))
      return linked({ leads: holon.body.leads?.$ref, to: holon.body.to }, inner, id);
    // A lifted sentence or term reads as the text it is, and can be found by its id.
    return <span data-holon={id}>{inner}</span>;
  });
}

// One block of a flow, or nothing where the holon is not prose.
export function block(holons: Holons, id: string): Node | null {
  const holon = holons[id];
  if (!holon) return null;

  const { body, types } = holon;

  if (types.includes("paragraph") || types.includes("sentence")) return <p>{inline(holons, id)}</p>;
  if (types.includes("break")) return <hr />;
  if (types.includes("code"))
    return (
      <pre>
        <code>{body.text}</code>
      </pre>
    );
  if (types.includes("drawing")) return <pre>{(body.lines as string[]).join("\n")}</pre>;
  if (types.includes("quote"))
    return <blockquote>{refsOf(body.prose).map((inner) => block(holons, inner))}</blockquote>;
  if (types.includes("list")) return <ul>{refsOf(body.items).map((inner) => block(holons, inner))}</ul>;

  if (types.includes("item"))
    return (
      <li>
        {inline(holons, id)}
        {body.list && block(holons, body.list.$ref)}
      </li>
    );

  return null;
}
