// Text into holons: a paragraph is its sentences, a sentence is its words, and a word is
// its text and its marks. Where else a word is said, and the lexicon, are worked out from
// the field's words when asked, never written beside them.
//
// In the text, {typed|meant} marks a correction, and _ inside the braces stands
// for a space. Marks and spaces around a word are kept on the word.

import type { Holon } from "../integrations/glass/store.ts";
import { typeNamed, typesOf } from "../stores.ts";

const ref = (to: string) => ({ $ref: to });

// Splits text into word tokens, keeping lone marks on the word beside them.
function tokens(sentence: string) {
  const out: string[] = [];
  let carry = "";

  // A correction written with spaces inside it is still one word.
  const marked = sentence.replace(/\{[^{}|]*\|[^{}]*\}/g, (mark) => mark.replace(/\s+/g, "_"));

  for (const token of marked.split(/\s+/).filter(Boolean)) {
    const standsAlone = !/[\p{L}\p{N}\p{S}{]/u.test(token);

    if (!standsAlone) {
      out.push(carry + token);
      carry = "";
    } else if (out.length && !carry) {
      out[out.length - 1] += token;
    } else {
      carry += token;
    }
  }

  if (carry) {
    if (out.length) out[out.length - 1] += carry;
    else out.push(carry);
  }

  return out;
}

const splitSentences = (paragraph: string) => paragraph.split(/(?<=[.?!])\s+(?=\S)/);

// A writer over the field as it stands. Holons it makes come under the handles it is
// given, so everything it was asked to make belongs in one commit, which gives them ids.
export function proseWriter(holons: Holon[], handle: () => string) {
  const types = typesOf(holons);
  const born: Holon[] = [];

  const put = (type: string, body: Record<string, unknown>, name?: string) => {
    const holon: Holon = {
      id: handle(),
      instance: [typeNamed(types, type)],
      ...(name ? { name } : {}),
      body,
    };
    born.push(holon);
    return holon.id;
  };

  function word(token: string) {
    const fix = token.match(/^(.*?)\{(.*)\|(.*)\}(.*)$/);
    const raw = fix ? fix[1]! + fix[3]!.replace(/_/g, " ") + fix[4]! : token;
    const split = raw.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)!;
    const text = split[2] || raw;
    const before = split[2] ? split[1] : "";
    const after = split[2] ? split[3] : "";
    const body: Record<string, unknown> = { text };

    if (fix) {
      const typed = fix[2]!.replace(/_/g, " ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (typed !== text) body.typed = typed;
    }

    if (before) body.before = before;
    if (after) body.after = after;

    return put("word", body);
  }

  const sentence = (text: string) => put("sentence", { words: tokens(text).map(word).map(ref) });

  const paragraph = (text: string) =>
    put("paragraph", { sentences: splitSentences(text).map(sentence).map(ref) });

  // An utterance's flow: its paragraphs, and a line of dashes or stars as a break.
  const flow = (text: string) =>
    text
      .trim()
      .split(/\n\s*\n|\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (/^[-*]{2,}$/.test(line) ? put("break", { mark: line }) : paragraph(line)));

  return { types, born, put, word, flow };
}

// The marks written prose carries: a link, whose target is an id or an address; code;
// strong; emphasis. What a mark holds is read the same way, so marks nest.
const marks = /\[[^\]]*\]\([^)]*\)|`[^`]*`|\*\*[^*]+\*\*|\*[^*]+\*/g;

// A writer of marked prose over the same writer, for rewriting what is already marked.
export function markedWriter({ put, word }: Pick<ReturnType<typeof proseWriter>, "put" | "word">) {
  // Spaces inside a mark are kept from what splits sentences and words.
  const hold = (text: string) => text.replace(marks, (mark) => mark.replace(/\s/g, "\u0001"));
  const release = (text: string) => text.replace(/\u0001/g, " ");

  function inlineOf(text: string): string[] {
    const out: string[] = [];
    let at = 0;

    const plain = (part: string) => out.push(...tokens(part).map(word));

    for (const match of text.matchAll(marks)) {
      plain(text.slice(at, match.index));
      at = match.index + match[0].length;

      const mark = match[0];
      const link = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(mark);

      if (link) {
        const leads = /^[0-9A-HJKMNP-TV-Z]{15}$/.test(link[2]!) ? { leads: ref(link[2]!) } : { to: link[2]! };
        out.push(put("link", { words: inlineOf(link[1]!).map(ref), ...leads }));
      } else if (mark.startsWith("`")) {
        out.push(put("codespan", { text: mark.slice(1, -1) }));
      } else if (mark.startsWith("**")) {
        out.push(put("strong", { words: inlineOf(mark.slice(2, -2)).map(ref) }));
      } else {
        out.push(put("emphasis", { words: inlineOf(mark.slice(1, -1)).map(ref) }));
      }
    }

    plain(text.slice(at));

    return out;
  }

  const sentence = (text: string) => put("sentence", { words: inlineOf(release(text)).map(ref) });

  const sentencesOf = (text: string) => splitSentences(hold(text)).map(sentence).map(ref);

  return {
    paragraph: (text: string) => put("paragraph", { sentences: sentencesOf(text) }),
    item: (text: string) => put("item", { sentences: sentencesOf(text) }),
  };
}
