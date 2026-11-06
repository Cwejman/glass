// Rewrites branches/union.json over every store, keeping the union's own ids.
const R = "references/s44230-026-00140-x";
const rd = async (f: string) => Bun.file(f).json();
const [union, type] = await rd("branches/union.json");
const prim = await rd("branches/primitives.json"), lex = await rd("branches/lexicon.json"), ses = await rd("branches/session.json"), wiki = await rd("branches/wiki.json");
const base = await rd(R + "/branches/base.json"), btypes = await rd(R + "/branches/types.json"), lic = await rd(R + "/licence.json");
const brs = [...new Bun.Glob("branch-*.json").scanSync(R + "/branches")].sort();
const all0: any[] = [];
const ref = (id: string) => ({ $ref: id });
const entry = (name: string, file: string, roots: string[], keeps?: string) => ({ name, file, roots: roots.map(ref), ...(keeps ? { keeps } : {}) });
const sessionType = prim.find((h: any) => h.name === "session").id;
const stores = [
  entry("primitives", "branches/primitives.json", prim.map((h: any) => h.id)),
  entry("lexicon", "branches/lexicon.json", [lex.find((h: any) => h.name === "lexicon").id]),
  entry("session", "branches/session.json", [ses[0].id]),
  entry("wiki", "branches/wiki.json", [wiki[0].id]),
  ...(await (async () => { const sl = await rd("branches/slices.json"); all0.push(...sl); return [entry("slices", "branches/slices.json", sl.map((h: any) => h.id))]; })()),
  ...(await (async () => { const md = await rd("branches/markdown.json"); all0.push(...md); return [entry("markdown", "branches/markdown.json", [md.find((h: any) => h.name === "wiki-markdown").id])]; })()),
  ...(await (async () => { const st = await rd("branches/statistics.json"); all0.push(...st); return [entry("statistics", "branches/statistics.json", st.filter((h: any) => h.mould || h.body.gives).map((h: any) => h.id))]; })()),
  entry("the paper, base", R + "/branches/base.json", [base[0].id, base[1].id], "local by licence: CC BY-NC-ND, adapted material not shared"),
  entry("the paper, branch types", R + "/branches/types.json", btypes.map((h: any) => h.id), "local by licence"),
  ...await Promise.all(brs.map(async (f) => { const b = await rd(R + "/branches/" + f); return entry("the paper, " + b[0].name, R + "/branches/" + f, [b[0].id], "local by licence"); })),
  entry("the paper, licence", R + "/licence.json", [lic.id]),
];
// Keep any store another session added, as it wrote it.
const mine = new Set(stores.map((x) => x.name));
const theirs = (union.body.stores as any[]).filter((x) => !mine.has(x.name) && x.name !== "fork" && Bun.file(x.file).size > 0);
for (const t of theirs) all0.push(...await rd(t.file));
union.body.stores = [...stores, ...theirs];
await Bun.write("branches/union.json", "[\n" + [union, type].map((h) => "  " + JSON.stringify(h)).join(",\n") + "\n]\n");
const all = [...all0, ...prim, ...lex, ...ses, ...wiki, ...base, ...btypes, lic, union, type];
for (const f of brs) all.push(...await rd(R + "/branches/" + f));
const ids = new Set(all.map((h: any) => h.id));
let missing = 0; const scan = (v: any): void => { if (Array.isArray(v)) v.forEach(scan); else if (v && typeof v === "object") { if (v.$ref && !ids.has(v.$ref)) missing++; Object.values(v).forEach(scan); } };
all.forEach((h: any) => scan(h.body));
console.log(stores.length, "stores;", all.length, "holons,", ids.size, "unique;", missing, "missing refs");
