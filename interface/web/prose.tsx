// Prose drawn from its holons, as the native whole gives them: a paragraph is its
// sentences, a sentence is its words, and a word is what comes before it, its text, and
// what comes after. Nothing here is drawn by a component of its own, so a brief of
// thousands of words is one drawing. What is not prose, standing in a flow, is left to
// whoever draws the flow.

import { h, type Child } from "../../components/jsx.ts";

// A holon as the native whole gives it: its body as it is kept, and its types' names.
export type Read = { id: string; name?: string; types: string[]; body: Record<string, any> };
export type Holons = Readonly<Record<string, Read>>;

export const refsOf = (list: unknown) =>
  (Array.isArray(list) ? list : []).flatMap((each) =>
    each !== null && typeof each === "object" && typeof each.$ref === "string" ? [each.$ref as string] : [],
  );

const isWord = (holon: Read | undefined): holon is Read => Boolean(holon?.types.includes("word"));

// A mark standing as a word of its own, as a comma after a link, keeps to what is before it.
const keepsClose = (holon: Read | undefined) => isWord(holon) && /^[.,;:!?)\]]+$/.test(holon.body.text);

// A word whose mark before it closes what came before, as a comma after code, keeps that
// mark close to it and is set apart after the mark instead.
const leadsClose = (holon: Read | undefined) => isWord(holon) && /^[.,;:!?)\]]/.test(holon.body.before ?? "");

// Words and what stands among them, each set apart by a space.
function spaced(holons: Holons, ids: string[]): Child[] {
  return ids.flatMap((id, i) => [
    i > 0 && !keepsClose(holons[id]) && !leadsClose(holons[id]) ? " " : null,
    inline(holons, id),
  ]);
}

// A link that leads into the field is a link to it in this page; one to the web stays a
// link. An image is not fetched: loading it would tell whoever serves it who reads, and
// when.
function linked({ body }: Read, words: Child[]): Node {
  if (body.leads?.$ref)
    return (
      <a class="ref" href={`?q=@${body.leads.$ref}`} data-ref={body.leads.$ref}>
        {words}
      </a>
    );
  if (!body.image && /^(https?|mailto):/i.test(body.to ?? "")) return <a href={body.to}>{words}</a>;

  return (
    <span class="unlinked" title={body.to}>
      {words}
    </span>
  );
}

export function inline(holons: Holons, id: string): Child {
  const holon = holons[id];
  if (!holon) return null;

  const { body, types } = holon;

  if (types.includes("word"))
    return [body.before ?? "", leadsClose(holon) ? " " : "", body.text, body.after ?? ""].join("");
  if (types.includes("codespan") || types.includes("closed")) return <code>{body.text}</code>;

  const inside = spaced(holons, [...refsOf(body.sentences), ...refsOf(body.words)]);

  if (types.includes("emphasis")) return <em>{inside}</em>;
  if (types.includes("strong")) return <strong>{inside}</strong>;
  if (types.includes("link")) return linked(holon, inside);

  return inside;
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
        {spaced(holons, refsOf(body.sentences))}
        {body.list && block(holons, body.list.$ref)}
      </li>
    );

  return null;
}
