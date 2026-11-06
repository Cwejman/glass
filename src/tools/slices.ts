// Cuts the union into the commits it would be born in: by its own structure
// and in the order things came, each slice declared by its roots. What a
// slice packs is derived, never listed: every holon its roots reach that no
// earlier slice has packed. Writes store/slices.json and prints the measure.
// Usage: bun src/tools/slices.ts

const { newId } = await import(`${process.cwd()}/src/store/id.ts`);
const R = "store/paper";
const rd = async (f: string) => { const v = await Bun.file(f).json(); return Array.isArray(v) ? v : [v]; };
const union = (await rd("store/union.json"))[0];
const files: string[] = union.body.stores.map((s: any) => s.file);
const all = new Map<string, any>();
const fileOf = new Map<string, string>();
for (const f of [...files, "store/union.json"].filter((f) => f !== "store/slices.json")) for (const h of await rd(f)) { all.set(h.id, h); fileOf.set(h.id, f); }
const inFile = (f: string, n: string) => [...all.values()].find((h) => h.name === n && fileOf.get(h.id) === f)!;
const named = (n: string) => [...all.values()].find((h) => h.name === n)!;

// The slices, in order. Each is a title, the whole it belongs to, and its roots.
type Slice = { title: string; whole: string; roots: string[] };
const slices: Slice[] = [];
const add = (title: string, whole: string, roots: string[]) => slices.push({ title, whole, roots });
const refs = (v: any): string[] => (v ?? []).map((r: any) => r.$ref);

// 1. What everything is made of: the types, glass's and the paper's.
add("The primitives", "primitives", [...all.values()].filter((h) => h.mould).map((h) => h.id));
// 2. This session, an utterance at a time, as it was said; each brings its words and the paths born with it.
const session = (await rd("store/session.json"))[0];
const pathType = named("path").id;
const sessionHolons = await rd("store/session.json");
for (const u of refs(session.body.said)) {
  const born = sessionHolons.filter((h: any) => h.instance[0] === pathType && refs(h.body.from)[0] === u).map((h: any) => h.id);
  add(`The second session, utterance ${all.get(u).body.order}`, "session", [u, ...born]);
}
add("The second session, as a whole", "session", [session.id]);
// 3. The forks that met it, each an utterance at a time.
for (const f of ["fork-licence", "fork-selection"]) {
  const hs = await rd(`store/${f}.json`);
  const s = hs.find((h: any) => h.instance[0] === named("session").id);
  for (const u of refs(s.body.said)) add(`${s.name}, utterance ${all.get(u)?.body?.order ?? "?"}`, f, [u]);
  add(`${s.name}, as a whole`, f, [s.id]);
}
// 4. The wiki, a file at a time in the order its root holds them, each with its markdown surface.
const wiki = named("wiki");
const forms = named("wiki-markdown");
const formsOf = (root: string) => refs(forms.body.forms).filter((id) => JSON.stringify(all.get(id)?.body ?? {}).includes(root));
for (const p of refs(wiki.body.parts)) add(`The wiki: ${all.get(p).body.title}`, "wiki", [p, ...formsOf(p)]);
add("The wiki, as a whole", "wiki", [wiki.id]);
add("The wiki's markdown surface, what remains", "markdown", [forms.id]);
// 5. The paper: its licence, its base a top section at a time, then each branch a commit of its own.
add("The paper's licence", "paper", [(await rd(`${R}/licence.json`))[0].id]);
const doc = named("holonic-systems-2026");
for (const s of refs(doc.body.sections)) add(`The paper: ${all.get(s).body.number} ${all.get(s).body.title}`.replace("  ", " "), "paper base", [s]);
add("The paper, as a document", "paper base", [doc.id, inFile(`${R}/base.json`, "lexicon").id]);
for (const h of [...all.values()].filter((h) => /^branch-\d+$/.test(h.name ?? "")).sort((a, b) => a.name.localeCompare(b.name)))
  add(`The paper, ${h.name} (${h.body.model}, seed from ${h.body.seedFrom})`, "paper branches", [h.id]);
// 6. What reads it all: the statistics, the lexicon as it then stands, the union.
add("The statistics", "statistics", [...all.values()].filter((h) => fileOf.get(h.id) === "store/statistics.json").map((h) => h.id));
add("The lexicon, as it then stands", "lexicon", [inFile("store/lexicon.json", "lexicon").id]);
add("The union", "union", [union.id]);

// Derive what each slice packs: what its roots hold, all the way down, not yet
// packed. A reference holds where it says so by $holds, else where its type's
// mould says so. What only points is not packed, but for the lexemes a word
// points at, born with the first slice that says them. Types are the first slice's.
const lexemeTypes = new Set([...all.values()].filter((h) => h.name === "lexeme" && h.mould).map((h) => h.id));
const packed = new Set<string>();
const rootOf = new Map<string, number>();
slices.forEach((s, i) => s.roots.forEach((r) => { if (!rootOf.has(r)) rootOf.set(r, i); }));
let current = 0;
const reach = (id: string, out: string[], root = false) => {
  if (packed.has(id) || !all.has(id)) return;
  const h = all.get(id);
  if (h.mould && !root) return;
  // A holon that roots a later slice is packed by that slice, not reached into.
  if (!root && (rootOf.get(id) ?? -1) > current) return;
  packed.add(id); out.push(id);
  const mould = all.get(h.instance?.[0])?.mould ?? {};
  for (const [k, v] of Object.entries(h.body ?? {})) {
    const fieldHolds = mould[k]?.holds;
    const walk = (x: any): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === "object") {
        if (x.$ref) {
          const holds = x.$holds ?? fieldHolds ?? false;
          const target = all.get(x.$ref);
          if (holds || (target && lexemeTypes.has(target.instance?.[0]))) reach(x.$ref, out);
        }
        Object.values(x).forEach(walk);
      }
    };
    walk(v);
  }
};
const measure = slices.map((s, i) => { current = i; const out: string[] = []; for (const r of s.roots) reach(r, out, true); return { s, n: out.length, bytes: out.reduce((b, id) => b + JSON.stringify(all.get(id)).length, 0) }; });
const rest = [...all.keys()].filter((id) => !packed.has(id));

// The slices as holons: each declared by its roots and its place, never by what it packs.
// Slices already declared keep their ids: the same title in the same whole is the same slice.
const before = await Bun.file("store/slices.json").exists() ? await rd("store/slices.json") : [];
const beforeType = before.find((h: any) => h.name === "slice");
const idOfSlice = new Map(before.filter((h: any) => h.body?.title).map((h: any) => [`${h.body.whole}|${h.body.title}`, h.id]));
const type = { id: beforeType?.id ?? newId(), instance: [], name: "slice", mould: {
  title: { says: "What the commit adds, in a few words.", shape: "string" },
  whole: { says: "The whole it belongs to, by name.", shape: "string" },
  order: { says: "Its place in the birth.", shape: "number" },
  roots: { says: "The holons it begins from; it packs every holon they reach that no earlier slice packed.", shape: { list: "ref" }, holds: false },
}, body: { says: "One commit of a store's birth, cut by the whole's own structure and in the order things came: a slice packs only what it adds, so the birth is as fine as its slices and its history reads as it happened." } };
const holons = [type, ...slices.map((s, i) => ({ id: idOfSlice.get(`${s.whole}|${s.title}`) ?? newId(), instance: [type.id], body: { title: s.title, whole: s.whole, order: i + 1, roots: s.roots.map((r) => ({ $ref: r })) } }))];
await Bun.write("store/slices.json", "[\n" + holons.map((h) => "  " + JSON.stringify(h)).join(",\n") + "\n]\n");

// The measure, by whole.
const byWhole = new Map<string, { slices: number; n: number; bytes: number; most: number }>();
for (const { s, n, bytes } of measure) {
  const w = byWhole.get(s.whole) ?? { slices: 0, n: 0, bytes: 0, most: 0 };
  w.slices++; w.n += n; w.bytes += bytes; w.most = Math.max(w.most, bytes); byWhole.set(s.whole, w);
}
const kb = (b: number) => (b / 1024).toFixed(0).padStart(7) + " KB";
console.log("WHOLE              slices   holons      bytes     largest slice");
for (const [w, v] of byWhole) console.log(`${w.padEnd(18)} ${String(v.slices).padStart(5)} ${String(v.n).padStart(8)} ${kb(v.bytes)} ${kb(v.most)}`);
const sizes = measure.map((m) => m.bytes).sort((a, b) => a - b);
console.log(`\n${slices.length} slices; ${packed.size} of ${all.size} holons packed; ${rest.length} reached by no slice`);
console.log(`slice size: median ${kb(sizes[sizes.length >> 1]!)}, largest ${kb(sizes.at(-1)!)}`);
if (rest.length) console.log("unreached, by file:", JSON.stringify(Object.fromEntries([...new Set(rest.map((id) => fileOf.get(id)))].map((f) => [f, rest.filter((id) => fileOf.get(id) === f).length]))));
