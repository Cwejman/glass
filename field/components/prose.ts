import { Marked, type Token, type Tokens } from "marked";

// Prose under the rule, drawn: markdown whose links into the field are
// `ref:<id>`. A paragraph that is nothing but one such link places a part
// there; any other link only mentions. A link to the web stays a link; one
// to somewhere the field cannot reach, as a git commit, is shown as text
// with its address where the pointer rests. Raw HTML in prose is shown as
// text, never run.

export const refOf = (href: string) =>
  /^ref:([0-9A-HJKMNP-TV-Z]{26})(?:@sha256-[0-9a-f]{64})?$/.exec(href)?.[1];

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );

export const markdown = new Marked({
  renderer: {
    html: ({ text }) => escape(text),
    // An image is not fetched: loading it would tell whoever serves it who
    // reads, and when. It is shown by what it says, its address beside.
    image: ({ href, text }) =>
      `<span class="unlinked" title="${escape(href)}">${escape(text || "an image")}</span>`,
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const ref = refOf(href);
      if (ref) return `<a href="#" data-ref="${ref}"${title ? ` title="${escape(title)}"` : ""}>${text}</a>`;
      if (/^(https?|mailto):/i.test(href))
        return `<a href="${escape(href)}"${title ? ` title="${escape(title)}"` : ""}>${text}</a>`;
      return `<span class="unlinked" title="${escape(href)}">${text}</span>`;
    },
  },
});

// The part a paragraph places, if it is nothing but a link into the field.
export function placed(token: Token): string | undefined {
  return slotOf(token)?.id;
}

// The slot a paragraph makes, if it is nothing but a link into the field:
// the holon it places, and how it is drawn there, as the link's title says,
// a face unless it says `whole`.
export function slotOf(token: Token): { id: string; draws: string } | undefined {
  if (token.type !== "paragraph") return undefined;
  const inner = (token as Tokens.Paragraph).tokens.filter((t) => !(t.type === "text" && t.raw.trim() === ""));
  if (inner.length !== 1 || inner[0]!.type !== "link") return undefined;

  const link = inner[0] as Tokens.Link;
  const id = refOf(link.href);
  return id ? { id, draws: link.title === "whole" ? "whole" : "face" } : undefined;
}

// A paragraph that is all emphasis, as the rule's confidence line is.
export function isConfidence(token: Token) {
  if (token.type !== "paragraph") return false;
  const inner = (token as Tokens.Paragraph).tokens;
  return inner.length === 1 && inner[0]!.type === "em";
}

// The face: the first paragraph, its links shown as their words, since the
// face as a whole is what is entered.
const plain = new Marked({
  renderer: {
    html: ({ text }) => escape(text),
    image: ({ text }) => escape(text || "an image"),
    link({ tokens }) {
      return this.parser.parseInline(tokens);
    },
  },
});

export function faceOf(prose: string): string {
  const first = markdown
    .lexer(prose)
    .find((token) => token.type === "paragraph" && !placed(token) && !isConfidence(token));
  return first ? (plain.parseInline((first as Tokens.Paragraph).text) as string) : "";
}
