// Appends one utterance of the author's to the session in the shared branches,
// keeping every existing id: new holons are born now, the session's list and
// the lexicon grow, nothing else is rewritten.
// Usage: bun append.ts <glass repo> <utterance.txt> <typed|spoken> [path-patch.json]
// {typed|meant} marks a fix; _ inside it stands for a space.

const [repo, file, as, patchFile] = process.argv.slice(2);
const { newId } = await import(`${repo}/src/store/id.ts`);
const dir = `${repo}/branches`;
const read = async (f: string) => Bun.file(`${dir}/${f}`).json();
const write = async (f: string, hs: unknown[]) =>
  Bun.write(`${dir}/${f}`, "[\n" + hs.map((h) => "  " + JSON.stringify(h)).join(",\n") + "\n]\n");

const primitives = await read("primitives.json");
const lexicon = await read("lexicon.json");
const session = await read("session.json");
const T = Object.fromEntries(primitives.map((h: any) => [h.name, h.id]));
const ref = (to: string) => ({ $ref: to });
type H = { id: string; instance: string[]; name?: string; body: Record<string, unknown> };
const born: H[] = [];
const put = (h: Omit<H, "id">) => { const x = { id: newId(), ...h }; born.push(x); return x.id; };

const lexiconHolon = lexicon.find((h: any) => h.name === "lexicon");
const byText = new Map<string, string>(lexicon.filter((h: any) => h.instance[0] === T.lexeme).map((h: any) => [h.body.text, h.id]));
const newLexemes: H[] = [];
const lexeme = (t: string) => {
  const k = t.toLowerCase();
  if (!byText.has(k)) {
    const h = { id: newId(), instance: [T.lexeme], body: { text: k } };
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
  for (const p of patch.add ?? []) (s0.body.paths as unknown[]).push(ref(put({ instance: [T.path], body: { ...p, stands: "noted", from: [ref(u)] } })));
  for (const e of patch.edit ?? []) {
    const h = session.find((x: any) => x.instance[0] === T.path && x.body.title === e.title);
    if (!h) throw new Error(`no path titled ${e.title}`);
    h.body.opens = e.opens; h.body.from.push(ref(u));
  }
}

await write("session.json", [...session, ...born]);
await write("lexicon.json", [...lexicon, ...newLexemes]);
console.log({ utterance: order, holons: born.length, newLexemes: newLexemes.length, session: session.length + born.length, lexicon: lexicon.length + newLexemes.length });
