// Prose drawn from its holons: a paragraph is its sentences, a sentence is its words,
// and a word is what comes before it, its text, and what comes after. Nothing here is
// a slot, so a brief of thousands of words is one drawing. What is not prose, standing
// in a flow, is left to whatever the caller opens for it.

import type { HolonRead, Whole } from "../engine/reads.ts";
import { h, type Child } from "./jsx.ts";

type Holons = Whole["holons"];

export const refsOf = (list: unknown) => ((list ?? []) as { $ref: string }[]).map(({ $ref }) => $ref);

// A mark standing as a word of its own, as a comma after a link, keeps to what is before it.
const keepsClose = (holon: HolonRead | undefined) =>
  !!holon?.types.includes("word") && /^[.,;:!?)\]]+$/.test(holon.body.text);

// Words and what stands among them, each set apart by a space.
function spaced(holons: Holons, ids: string[]): Child[] {
  return ids.flatMap((id, i) => [i > 0 && !keepsClose(holons[id]) ? " " : null, inline(holons, id)]);
}

// A link that leads into the field says where, so a press on it rises with it. One
// to the web stays a link. An image is not fetched: loading it would tell whoever
// serves it who reads, and when.
function linked({ body }: HolonRead, words: Child[]) {
  if (body.leads)
    return (
      <a href="#" data-location={JSON.stringify([body.leads.$ref])}>
        {words}
      </a>
    );
  if (body.image)
    return (
      <span class="unlinked" title={body.to}>
        {words}
      </span>
    );
  if (/^(https?|mailto):/i.test(body.to ?? "")) return <a href={body.to}>{words}</a>;

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

  if (types.includes("word")) return [body.before ?? "", body.text, body.after ?? ""].join("");
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

  if (types.includes("quote")) {
    return <blockquote>{refsOf(body.prose).map((inner) => block(holons, inner))}</blockquote>;
  }

  if (types.includes("list")) {
    return <ul>{refsOf(body.items).map((inner) => block(holons, inner))}</ul>;
  }

  if (types.includes("item")) {
    return (
      <li>
        {spaced(holons, refsOf(body.sentences))}
        {body.list && block(holons, body.list.$ref)}
      </li>
    );
  }

  return null;
}
