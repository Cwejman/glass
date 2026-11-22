// Text into holons. A paragraph holds its text, as runs: the text as written, its marks
// within it, *emphasis*, **strong** and `code`, and a holon wherever something points at
// a part of it alone, lifted out and held in its place. A link into the field is such a
// holon, as is a sentence a thread was raised in or a measure reaches; nothing is lifted
// before something points there. Text is compared as text, and a part is found by where
// it stands in it.
//
// In the author's words, {typed|meant} marks a correction, and _ inside the braces stands
// for a space: the paragraph holds what was meant, and beside it, as typed, what was
// typed or heard. Their words are plain, so a mark among them is written escaped.

import type { Holon } from "./field.ts";
import { typeNamed, typesOf } from "../stores.ts";

// A run of a paragraph's text: text as written, or a holon held in its place.
export type Run = string | { $ref: string; $holds: true };

const held = (id: string): Run => ({ $ref: id, $holds: true });
const isHeld = (run: unknown): run is { $ref: string } =>
  typeof run === "object" && run !== null && typeof (run as { $ref?: unknown }).$ref === "string";

// Plain words as marked text: whatever would read as a mark is escaped.
export const escaped = (plain: string) => plain.replace(/[\\*`[\]]/g, (mark) => `\\${mark}`);

// Runs, the strings beside each other made one, and none empty.
export function joined(runs: readonly Run[]): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    if (typeof run === "string") {
      if (!run) continue;
      if (typeof out.at(-1) === "string") out[out.length - 1] += run;
      else out.push(run);
    } else out.push(run);
  }
  return out;
}

// The marks written prose carries: a link, whose target is an id or an address; code;
// strong; emphasis. A link into the field, by its id, is a holon; any other stays text.
const marks = /\[[^\]]*\]\([^)]*\)|`[^`]*`|\*\*[^*]+\*\*|\*[^*]+\*/g;
const intoField = /^\[([^\]]*)\]\(([0-9A-HJKMNP-TV-Z]{15})\)$/;

// Where a text's sentences end: after a full stop, a question or an exclamation, and
// spaces, never within a mark.
function sentenceEnds(text: string): number[] {
  const within = new Uint8Array(text.length);
  for (const match of text.matchAll(marks)) within.fill(1, match.index, match.index + match[0].length);
  const ends: number[] = [];
  for (const match of text.matchAll(/(?<=[.?!])\s+(?=\S)/g))
    if (!within[match.index!]) ends.push(match.index!, match.index! + match[0].length);
  return ends;
}

// A writer over the field as it stands, its types by name, those given or the first of
// each name among the holons. Holons it makes come under the handles it is given, so
// everything it was asked to make belongs in one commit, which gives them ids.
export function proseWriter(
  holons: Holon[],
  handle: () => string,
  types: Record<string, string> = typesOf(holons),
) {
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

  // A paragraph of the author's plain words: what was meant, and what was typed where a
  // correction says it differed.
  function paragraph(line: string) {
    const meant = line.replace(/\{([^{}|]*)\|([^{}]*)\}/g, (_mark, _typed, said: string) =>
      said.replace(/_/g, " "),
    );
    const typed = line.replace(/\{([^{}|]*)\|([^{}]*)\}/g, (_mark, was: string) => was.replace(/_/g, " "));
    return put("paragraph", { text: [escaped(meant)], ...(typed !== meant ? { typed } : {}) });
  }

  // An utterance's flow: its paragraphs, and a line of dashes or stars as a break.
  const flow = (text: string) =>
    text
      .trim()
      .split(/\n\s*\n|\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => (/^[-*]{2,}$/.test(line) ? put("break", { mark: line }) : paragraph(line)));

  return { types, born, put, flow };
}

// A writer of marked prose over the same writer, for writing and rewriting what is
// already marked.
export function markedWriter({ put }: Pick<ReturnType<typeof proseWriter>, "put">) {
  // Marked text as runs: each link into the field a holon, the rest as written.
  function runsOf(text: string): Run[] {
    const out: Run[] = [];
    let at = 0;
    for (const match of text.matchAll(marks)) {
      const link = intoField.exec(match[0]);
      if (!link) continue;
      out.push(text.slice(at, match.index));
      out.push(held(put("link", { text: runsOf(link[1]!), leads: { $ref: link[2]! } })));
      at = match.index! + match[0].length;
    }
    out.push(text.slice(at));
    return joined(out);
  }

  // Marked text as runs, each sentence among those kept, by its text, lifted again as
  // the holon it was, so what pointed at it still finds it.
  function keeping(text: string, kept: ReadonlyMap<string, string>, still: Set<string>): Run[] {
    if (!kept.size) return runsOf(text);
    const ends = [0, ...sentenceEnds(text), text.length];
    const out: Run[] = [];
    for (let i = 0; i < ends.length; i += 2) {
      const sentence = text.slice(ends[i], ends[i + 1]);
      const id = kept.get(sentence);
      if (id) {
        still.add(id);
        out.push(held(id));
      } else out.push(...runsOf(sentence));
      if (i + 2 < ends.length) out.push(text.slice(ends[i + 1], ends[i + 2]));
    }
    return joined(out);
  }

  // The sentences kept again, by their ids, as rewrites find them.
  const still = new Set<string>();

  return {
    runsOf,
    still,
    paragraph: (text: string) => put("paragraph", { text: runsOf(text) }),
    // A paragraph said again, lifting again the sentences given by their text.
    paragraphKeeping: (text: string, kept: ReadonlyMap<string, string>) =>
      put("paragraph", { text: keeping(text, kept, still) }),
    item: (text: string) => put("item", { text: runsOf(text) }),
  };
}

// A holon's runs as marked text, each holon in them by what reads it.
export function markedOf(
  runs: unknown,
  holonOf: (id: string) => Pick<Holon, "body"> | undefined,
  typeOf: (id: string) => string | undefined,
): string {
  const list = Array.isArray(runs) ? runs : [];
  return list
    .map((run) => {
      if (typeof run === "string") return run;
      if (!isHeld(run)) return "";
      const holon = holonOf(run.$ref);
      const inner = markedOf(holon?.body.text, holonOf, typeOf);
      return typeOf(run.$ref) === "link" ? `[${inner}](${holon?.body.leads?.$ref ?? holon?.body.to})` : inner;
    })
    .join("");
}

// The sentences of runs: where each begins and ends among them, by run and place within
// it, a holon held in them never cut.
export type Span = { text: string; from: [number, number]; to: [number, number] };

export function sentencesOf(runs: readonly Run[], textOf: (id: string) => string): Span[] {
  // The runs as one text, each holon standing as itself, said plainly.
  const pieces = runs.map((run) => (typeof run === "string" ? run : textOf(run.$ref)));
  const text = pieces.join("");
  const startOf = pieces.map((_, i) => pieces.slice(0, i).join("").length);
  const where = (offset: number): [number, number] => {
    let i = startOf.findLastIndex((start) => start <= offset);
    // A cut inside a holon falls at its edge.
    if (typeof runs[i] !== "string") return [i, offset > startOf[i]! ? 1 : 0];
    return [i, offset - startOf[i]!];
  };
  const ends = [0, ...sentenceEnds(text), text.length];
  const spans: Span[] = [];
  for (let i = 0; i < ends.length; i += 2)
    spans.push({ text: text.slice(ends[i], ends[i + 1]), from: where(ends[i]!), to: where(ends[i + 1]!) });
  return spans;
}

// Runs with one span lifted out as a holon of its own, given the id it is put under. A
// place in a holon's run is 0, before it, or 1, after it.
export function lifted(runs: readonly Run[], span: Span, putSentence: (runs: Run[]) => string): Run[] {
  // What of run i stands between a and b, to its end where b is not given.
  const piece = (i: number, a: number, b?: number): Run => {
    const run = runs[i]!;
    if (typeof run === "string") return run.slice(a, b);
    return a === 0 && (b === undefined || b === 1) ? run : "";
  };
  const [fromRun, fromAt] = span.from;
  const [toRun, toAt] = span.to;

  const inside: Run[] = [];
  for (let i = fromRun; i <= toRun; i++)
    inside.push(piece(i, i === fromRun ? fromAt : 0, i === toRun ? toAt : undefined));

  return joined([
    ...runs.slice(0, fromRun),
    piece(fromRun, 0, fromAt),
    held(putSentence(joined(inside))),
    piece(toRun, toAt),
    ...runs.slice(toRun + 1),
  ]);
}
