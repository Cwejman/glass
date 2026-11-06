// The paper as glass holons: the base branch, and a reading of it for agents.
// Usage: bun base.ts <glass repo> <paper.json> <out dir>
// Writes <out>/branches/base.json (holons) and <out>/reading.txt (keyed text).

const [repo, src, out] = process.argv.slice(2);
const { newId } = await import(`${repo}/src/store/id.ts`);
const doc = await Bun.file(src!).json();

const base = Date.UTC(2026, 10, 6, 18, 0, 0);
let tick = 0;
const id = () => newId(base + tick++, seeded(tick + 7919));
function seeded(n: number) {
  const r = new Uint8Array(16);
  let x = (n * 2654435761) >>> 0;
  for (let i = 0; i < 16; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; r[i] = x & 255; }
  return r;
}
const ref = (to: string) => ({ $ref: to });
type Holon = { id: string; instance: string[]; name?: string; mould?: unknown; body: Record<string, unknown> };
const holons: Holon[] = [];
const put = (h: Holon) => (holons.push(h), h.id);
const type = (name: string, says: string, mould: Record<string, unknown>) =>
  put({ id: id(), instance: [], name, mould, body: { says } });

const T = {
  document: type("document", "A work from outside the field, read in whole: what it is, where it came from, under what licence, and its sections in order.", {
    title: { says: "Its title.", shape: "string" },
    authors: { says: "Who wrote it.", shape: { list: "string" } },
    published: { says: "Where it was published.", shape: "string" },
    doi: { says: "Its DOI.", shape: "string" },
    source: { says: "Where it was read from.", shape: "string" },
    licence: { says: "The licence it is held under.", shape: "string" },
    keywords: { says: "Its keywords as given.", shape: { list: "string" } },
    sections: { says: "Its top sections, in order.", shape: { list: "ref" }, holds: true },
  }),
  section: type("section", "A section of a document, by its own number and title, holding its flow and then its subsections, in order: the holarchy the authors drew.", {
    number: { says: "Its number as printed, empty for the abstract.", shape: "string" },
    title: { says: "Its heading.", shape: "string" },
    flow: { says: "Its paragraphs and figures, in order.", shape: { list: "ref" }, holds: true },
    sections: { says: "Its subsections, in order.", shape: { list: "ref" }, holds: true, optional: true },
  }),
  figure: type("figure", "A figure or table of a document, held by its caption alone; its image is not read in.", {
    caption: { says: "The caption as printed.", shape: "string" },
  }),
  paragraph: type("paragraph", "One paragraph, held as its sentences; as read from a two-column page, so a break may fall where the authors had none.", {
    sentences: { says: "Its sentences, in order.", shape: { list: "ref" }, holds: true },
  }),
  sentence: type("sentence", "One sentence, held as its words in order.", {
    words: { says: "Its words, in order.", shape: { list: "ref" }, holds: true },
  }),
  word: type("word", "One word where it stands; it points at its lexeme, the word as one.", {
    text: { says: "The word, without the marks around it.", shape: "string" },
    before: { says: "Marks before it.", shape: "string", optional: true },
    after: { says: "Marks after it.", shape: "string", optional: true },
    lexeme: { says: "The word as one.", shape: "ref", holds: false },
  }),
  lexeme: type("lexeme", "A word as one, across every place it stands.", {
    text: { says: "The word, in lower case.", shape: "string" },
  }),
  lexicon: type("lexicon", "The whole holding every lexeme of this branch.", {
    lexemes: { says: "The lexemes.", shape: { set: "ref" }, holds: true },
  }),
};

const lexemes = new Map<string, string>();
const lexeme = (t: string) => {
  const k = t.toLowerCase();
  if (!lexemes.has(k)) lexemes.set(k, put({ id: id(), instance: [T.lexeme], body: { text: k } }));
  return lexemes.get(k)!;
};
function word(tok: string) {
  let [, before, text, after] = tok.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)!;
  if (!text) { text = tok; before = ""; after = ""; }
  const body: Record<string, unknown> = { text };
  if (before) body.before = before;
  if (after) body.after = after;
  body.lexeme = ref(lexeme(text.replace(/[’']s$/, "")));
  return put({ id: id(), instance: [T.word], body });
}
// Do not end a sentence after these.
const ABBR = /(?:\bet al|\be\.g|\bi\.e|\bSect|\bFig|\bvs|\bEq|\bRef|\bcf|\bNo|\b[A-Z])\.$/;
function splitSentences(text: string) {
  const parts = text.split(/(?<=[.?!])\s+(?=[A-Z(\["“])/);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && ABBR.test(out.at(-1)!)) out[out.length - 1] += " " + p;
    else out.push(p);
  }
  return out;
}
const sentenceKeys: string[] = [];
function paragraph(text: string) {
  const ss = splitSentences(text).map((s) =>
    put({ id: id(), instance: [T.sentence], body: { words: s.split(/\s+/).filter(Boolean).map(word).map(ref) } }));
  return put({ id: id(), instance: [T.paragraph], body: { sentences: ss.map(ref) } });
}

// The reading for agents: every paragraph and figure keyed, P001 and on.
const keyOf: Record<string, string> = {};
const reading: string[] = [];
let pn = 0;
const key = (holonId: string) => { const k = "P" + String(++pn).padStart(3, "0"); keyOf[k] = holonId; return k; };

// Nest sections by number.
type S = { number: string; title: string; level: number; flow: ({ text: string } | { figure: string })[] };
const sections: S[] = doc.sections;
function build(list: S[], at: number, level: number): [string[], number] {
  const ids: string[] = [];
  let i = at;
  while (i < list.length && list[i]!.level >= level) {
    const s = list[i]!;
    if (s.level > level) { i++; continue; }
    reading.push("", `${"#".repeat(s.level)} ${s.number} ${s.title}`.replace("  ", " "));
    const flow = s.flow.map((b) => {
      const h = "figure" in b
        ? put({ id: id(), instance: [T.figure], body: { caption: b.figure } })
        : paragraph(b.text);
      reading.push(`[${key(h)}] ${"figure" in b ? b.figure : b.text}`);
      return h;
    });
    const [subs, next] = build(list, i + 1, level + 1);
    const body: Record<string, unknown> = { number: s.number, title: s.title, flow: flow.map(ref) };
    if (subs.length) body.sections = subs.map(ref);
    ids.push(put({ id: id(), instance: [T.section], body }));
    i = next;
  }
  return [ids, i];
}
const [tops] = build(sections, 0, 1);
const document = put({ id: id(), instance: [T.document], name: "holonic-systems-2026", body: {
  title: doc.title, authors: doc.authors, published: doc.published, doi: doc.doi, source: doc.source,
  licence: doc.licence, keywords: doc.keywords.split(" · "), sections: tops.map(ref),
} });
const lexicon = put({ id: id(), instance: [T.lexicon], name: "lexicon", body: { lexemes: [...lexemes.values()].map(ref) } });

const top = [document, lexicon].map((x) => holons.find((h) => h.id === x)!);
const rest = holons.filter((h) => h.id !== document && h.id !== lexicon);
await Bun.write(`${out}/branches/base.json`, "[\n" + [...top, ...rest].map((h) => "  " + JSON.stringify(h)).join(",\n") + "\n]\n");
await Bun.write(`${out}/reading.txt`, `${doc.title}\n${doc.authors.join(", ")}. ${doc.published}. ${doc.licence}.\n` + reading.join("\n") + "\n");
await Bun.write(`${out}/keys.json`, JSON.stringify(keyOf, null, 1));
const count = (t: string) => holons.filter((h) => h.instance[0] === t).length;
console.log({ holons: holons.length, sections: count(T.section), paragraphs: count(T.paragraph), figures: count(T.figure), sentences: count(T.sentence), words: count(T.word), lexemes: count(T.lexeme), keys: pn });
