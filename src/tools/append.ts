// Appends one utterance of the author's to the session, as one commit on the
// store: only the holons it adds or changes are written, as new
// versions, and nothing written before is touched.
// Usage: bun src/tools/append.ts <utterance.txt> <typed|spoken> [paths.json]
// {typed|meant} marks a fix; _ inside it stands for a space.

import { commit, open, storeDir } from "./blocks.ts";

const [file, as, patchFile] = process.argv.slice(2);
const store = await open(storeDir);
const held = await store.holons();
const holons = [...held.values()].map((x) => x.holon) as any[];
const T = Object.fromEntries(holons.filter((h) => h.mould).map((h) => [h.name, h.id]).reverse());
const ref = (to: string) => ({ $ref: to });
type H = { id: string; instance: string[]; name?: string; body: Record<string, unknown> };
const born: H[] = [];
const put = (h: Omit<H, "id">) => { const x = { id: store.mint(), ...h }; born.push(x); return x.id; };
const changed = new Set<any>();
const lexicon = holons.filter((h) => h.instance[0] === T.lexeme || (h.name === "lexicon" && h.instance[0] === T.lexicon));
const session = holons.filter((h) => h.instance[0] === T.session && (h.name ?? "").startsWith("A second session"));
const lexiconHolon = lexicon.find((h: any) => h.name === "lexicon");

const byText = new Map<string, string>(lexicon.filter((h: any) => h.instance[0] === T.lexeme).map((h: any) => [h.body.text, h.id]));
const newLexemes: H[] = [];
const lexeme = (t: string) => {
  const k = t.toLowerCase();
  if (!byText.has(k)) {
    const h = { id: store.mint(), instance: [T.lexeme], body: { text: k } };
    newLexemes.push(h); byText.set(k, h.id);
    (lexiconHolon.body.lexemes as unknown[]).push(ref(h.id));
  }
  return byText.get(k)!;
};
function word(token: string) {
  const fix = token.match(/^(.*?)\{(.*)\|(.*)\}(.*)$/);
  const raw = fix ? fix[1] + fix[3].replace(/_/g, " ") + fix[4] : token;
  let [, before, text, after] = raw.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u)!;
  if (!text) { text = raw; before = ""; after = ""; }
  const body: Record<string, unknown> = { text };
  if (fix) {
    const typed = fix[2].replace(/_/g, " ").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (typed !== text) body.typed = typed;
  }
  if (before) body.before = before;
  if (after) body.after = after;
  body.lexeme = ref(lexeme(text.replace(/[’']s$/, "")));
  return put({ instance: [T.word], body });
}
function tokens(s: string) {
  const out: string[] = []; let carry = "";
  // A mark written with spaces inside it is still one word: its spaces become _.
  s = s.replace(/\{[^{}|]*\|[^{}]*\}/g, (m) => m.replace(/\s+/g, "_"));
  for (const t of s.split(/\s+/).filter(Boolean)) {
    if (!/[\p{L}\p{N}\p{S}{]/u.test(t)) { if (out.length && !carry) out[out.length - 1] += t; else carry += t; continue; }
    out.push(carry + t); carry = "";
  }
  if (carry && out.length) out[out.length - 1] += carry;
  return out;
}
const sentences = (par: string) => par.split(/(?<=[.?!])\s+(?=\S)/).map((s) =>
  put({ instance: [T.sentence], body: { words: tokens(s).map(word).map(ref) } }));

const text = await Bun.file(file!).text();
const s0 = session[0];
changed.add(s0);
const order = (s0.body.said as unknown[]).length + 1;
const flow = text.trim().split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean).map((p) =>
  /^[-*]{2,}$/.test(p)
    ? put({ instance: [T.break], body: { mark: p } })
    : put({ instance: [T.paragraph], body: { sentences: sentences(p).map(ref) } }));
const u = put({ instance: [T.utterance], body: { as, order, flow: flow.map(ref) } });
(s0.body.said as unknown[]).push(ref(u));

// A path patch: new paths, or a path's body changed in place by its title.
if (patchFile) {
  const patch: { add?: { title: string; opens: string; restsOn: string[] }[]; edit?: { title: string; opens: string }[] } = await Bun.file(patchFile).json();
  for (const { title, ...p } of patch.add ?? []) (s0.body.paths as unknown[]).push(ref(put({ instance: [T.path], name: title, body: { ...p, stands: "noted", from: [ref(u)] } })));
  for (const e of patch.edit ?? []) {
    const h = holons.find((x: any) => x.instance[0] === T.path && x.name === e.title);
    if (!h) throw new Error(`no path titled ${e.title}`);
    h.body.opens = e.opens; h.body.from.push(ref(u)); changed.add(h);
  }
}

if (newLexemes.length) changed.add(lexiconHolon);
const done = await commit(store, [...changed, ...born, ...newLexemes], `The second session, utterance ${order}`);
console.log({ utterance: order, holons: born.length + changed.size + newLexemes.length, newLexemes: newLexemes.length, blocks: done.blocks, bytes: done.bytes });
