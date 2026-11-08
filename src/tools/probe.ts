// Probes the field: charts it from its roots, down by holdings and across by
// pointings, so a reader can see its shape and choose pieces it can digest
// before reading any prose. A stand-in until the engine reads expressions.
//
//   bun src/tools/probe.ts [route] [scope] [mode]
//
// A route is a path from the roots, "85.3.2": root 85, its 3rd part, that
// one's 2nd. Roots are the holons nothing holds, in order of birth; parts are
// in the order they are held. Without a route, the mode applies to all roots.
//
// Scope, which stores are read (main, and each store beside it under store/):
//   --without paper,paper-readings      --only main
// Modes:
//   (none)          the parts, measured; --layers n unfolds n layers
//   --depths        layer by layer, to the bottom: holons, words, types
//   --points        pointings: between roots, or out of and into the route
//   --layer n       everything at layer n beneath, across
//   --type t        every holon of type t beneath, with its route
//   --digest n      pieces of at most n tokens covering what lies beneath
//   --text          the prose at the route, drawn from its holons
// Also --limit n (rows shown, default 40) and --types (types among the roots).
//
// Holding is followed only where declared: on the reference ($holds), or by
// the mould of the field. Everything else points. Depth is first reach from
// the roots, so a part held in several wholes stands at its shallowest. Words
// are word holons; prose kept as plain strings counts apart. Tokens are
// estimated as 1.85 per word, what the wiki was measured to cost a reading
// session on 2026-11-08, marks and spacing in its text included.

import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { open, storeDir } from "./blocks.ts";

const args = process.argv.slice(2);
const flag = (k: string) => { const i = args.indexOf(k); return i < 0 ? undefined : args[i + 1]; };
const has = (k: string) => args.includes(k);
const route = args[0] && !args[0].startsWith("--") ? args[0] : "";
const limit = Number(flag("--limit") ?? 40);

// ---- scope and ingest: each store on its own, so every holon knows its store
const stores: Record<string, string> = { main: storeDir };
for (const d of readdirSync(storeDir)) if (existsSync(join(storeDir, d, "refs/main"))) stores[d] = join(storeDir, d);
const without = new Set((flag("--without") ?? "").split(",").filter(Boolean));
const only = flag("--only")?.split(",");
for (const s of [...without, ...(only ?? [])]) if (!stores[s]) { console.error(`no store ${s}; there are ${Object.keys(stores).join(", ")}`); process.exit(1); }
const chosen = Object.keys(stores).filter((s) => (only ? only.includes(s) : !without.has(s)));
const t0 = performance.now();
const all = new Map<string, any>(), types = new Map<string, any>();
for (const s of Object.keys(stores)) {
  for (const [id, { holon }] of await (await open(stores[s]!)).holons()) {
    if (chosen.includes(s)) all.set(id, holon);
    if (holon.mould || !holon.instance?.length) types.set(id, holon);
  }
}
const typeOf = (id: string) => all.get(id) ?? types.get(id);
const tn = (h: any) => (h?.mould || !h?.instance?.length ? "type" : typeOf(h.instance[0])?.name ?? "?");

// ---- compose: holdings down, pointings across
const down = new Map<string, string[]>(), across = new Map<string, [string, string][]>();
let outside = 0;
for (const [id, h] of all) {
  const d: string[] = [], a: [string, string][] = [], mould = typeOf(h.instance?.[0])?.mould ?? {};
  const walk = (v: any, k: string) => {
    if (!v || typeof v !== "object") return;
    if (typeof v.$ref === "string") {
      if (!all.has(v.$ref)) { outside++; return; }
      if (v.$holds === true || (v.$holds !== false && mould[k]?.holds === true)) d.push(v.$ref); else a.push([k, v.$ref]);
      return;
    }
    for (const x of Object.values(v)) walk(x, k);
  };
  // A whole's flow comes before its parts, whatever order its keys are kept in.
  for (const [k, v] of Object.entries(h.body ?? {}).sort(([x], [y]) => +(x === "parts") - +(y === "parts"))) walk(v, k);
  down.set(id, d); across.set(id, a);
}
const parts = (id: string) => down.get(id) ?? [];
const held = new Set<string>(); for (const ps of down.values()) for (const p of ps) held.add(p);
const roots = [...all.keys()].filter((id) => !held.has(id) && (has("--types") || tn(all.get(id)) !== "type")).sort();
const typeRoots = [...all.keys()].filter((id) => !held.has(id) && tn(all.get(id)) === "type").length;
const under = new Map<string, number[]>();
roots.forEach((r, i) => { const seen = new Set([r]), st = [r]; while (st.length) { const x = st.pop()!; (under.get(x) ?? under.set(x, []).get(x)!).push(i + 1); for (const p of parts(x)) if (!seen.has(p)) { seen.add(p); st.push(p); } } });

// ---- measure
const skip = /^sha256-|^[0-9A-Z]{26}$/;
const strMemo = new Map<string, number>();
const stringWords = (id: string) => {
  const m = strMemo.get(id); if (m !== undefined) return m;
  const h = all.get(id); let n = 0;
  const w = (v: any) => { if (typeof v === "string") { if (!skip.test(v)) n += v.split(/\s+/).filter(Boolean).length; } else if (v && typeof v === "object" && typeof v.$ref !== "string") Object.values(v).forEach(w); };
  if (tn(h) !== "word") w(h.body);
  strMemo.set(id, n); return n;
};
type M = { words: number; strings: number; holons: number; types: Map<string, number> };
const memo = new Map<string, M>();
function measure(id: string): M {
  const m0 = memo.get(id); if (m0) return m0;
  const seen = new Set([id]), st = [id], m: M = { words: 0, strings: 0, holons: 0, types: new Map() };
  while (st.length) {
    const x = st.pop()!, t = tn(all.get(x));
    m.holons++; if (t === "word") m.words++; m.strings += stringWords(x);
    if (x !== id) m.types.set(t, (m.types.get(t) ?? 0) + 1);
    for (const p of parts(x)) if (!seen.has(p)) { seen.add(p); st.push(p); }
  }
  memo.set(id, m); return m;
}
const tokensPerWord = 1.85;
const tokens = (m: { words: number; strings: number }) => Math.round((m.words + m.strings) * tokensPerWord);

// ---- draw prose
const INLINE = new Set(["word", "sentence", "emphasis", "strong", "link", "codespan", "closed"]);
const SHOWN = new Set(["path", "order", "as", "text", "language", "lines", "mark"]);
function inline(id: string): string {
  const h = all.get(id), t = tn(h), b = h?.body ?? {};
  if (t === "word") return (b.before ?? "") + b.text + (b.after ?? "");
  if (t === "codespan" || t === "closed") return "`" + (b.text ?? "") + "`";
  const s = parts(id).map(inline).join(" ");
  return t === "link" ? `[${s}]` : t === "emphasis" ? `*${s}*` : t === "strong" ? `**${s}**` : s || b.text || "";
}
function text(id: string, lvl: number): string[] {
  const h = all.get(id), t = tn(h), b = h?.body ?? {};
  if (INLINE.has(t) || t === "paragraph") return [inline(id)];
  if (t === "item") return ["- " + inline(id)];
  if (t === "code") return ["```" + (b.language ?? ""), b.text ?? "", "```"];
  if (t === "drawing") return ["```", ...(b.lines ?? []), "```"];
  if (t === "break") return [b.mark ?? "---"];
  if (t === "type") return [`${"#".repeat(Math.min(6, lvl))} type ${h.name}`, b.says ?? "", ...Object.entries(h.mould ?? {}).map(([k, f]: any) => `- ${k}: ${f.says}`)];
  const head = h.name ?? (b.order != null ? `${b.order}. ${b.as ?? ""}` : undefined);
  const out: string[] = head ? [`${"#".repeat(Math.min(6, lvl))} ${head}${t !== "brief" ? ` (${t})` : ""}`] : [];
  for (const [k, v] of Object.entries(b)) if (!SHOWN.has(k) && (typeof v === "string" || typeof v === "number")) out.push(`${k}: ${v}`);
  const ps = parts(id);
  if (t === "list") return [...out, ...ps.flatMap((p) => text(p, lvl + 1))];
  for (const p of ps) out.push("", ...text(p, lvl + 1));
  return out;
}

// ---- show
const name = (id: string) => { const h = all.get(id), b = h.body ?? {}; const s = h.name ?? b.path ?? (b.order != null ? `${b.order}. ${b.as ?? ""}` : ""); return String(s || inline(id).slice(0, 60) || Object.values(b).find((v) => typeof v === "string" && !skip.test(v)) || "").replace(/\s+/g, " ").slice(0, 56); };
const top = (ts: Map<string, number>, n = 3) => [...ts].filter(([k]) => k !== "word").sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k} ${c}`).join(", ");
const bar = (w: number, max: number, width = 12) => "█".repeat(Math.round((w / Math.max(1, max)) * width)).padEnd(width);
const row = (r: string, id: string, max: number, ind = "") => { const m = measure(id); return `${ind}${r.padEnd(10)} ${String(tokens(m)).padStart(7)} ${bar(tokens(m), max)} ${tn(all.get(id))} "${name(id)}"${m.holons > 1 ? ` · ${m.holons}: ${top(m.types)}` : ""}`; };

// A route may end in a run of siblings, "1.23-30": the 23rd to the 30th part of 1.
let at: string | null = null, run: string[] | null = null;
const steps = route ? route.split(".") : [];
for (const [i, s] of steps.entries()) {
  const from = i === 0 ? roots : parts(at!);
  const [a, b] = s.split("-").map(Number) as [number, number | undefined];
  if (!from[a - 1] || (b !== undefined && !from[b - 1])) { console.error(`no part ${s} at ${steps.slice(0, i).join(".") || "the roots"}: it has ${from.length}`); process.exit(1); }
  if (b !== undefined) { if (i !== steps.length - 1) { console.error("a run of siblings ends a route"); process.exit(1); } run = from.slice(a - 1, b); break; }
  at = from[a - 1]!;
}
if (run && !has("--text")) { console.error("a run of siblings is read with --text"); process.exit(1); }
const below = at ? parts(at) : roots;
const base = route ? route + "." : "";
const each = (fn: (id: string, r: string, d: number) => boolean | void) => { const go = (ids: string[], prefix: string, d: number) => ids.forEach((id, i) => { const r = prefix + (i + 1); if (fn(id, r, d) !== false) go(parts(id), r + ".", d + 1); }); go(below, base, 1); };

if (!has("--text")) {
  console.log(`scope: ${chosen.join(" + ")} · ${all.size} holons · ${roots.length} roots, ${typeRoots} types · ${outside} references lead out of scope · ${(performance.now() - t0).toFixed(0)}ms`);
  if (at) { const m = measure(at); console.log(`${route}: ${tn(all.get(at))} "${name(at)}" · ≈${tokens(m)} tokens (${m.words} words + ${m.strings} in strings) · ${m.holons} holons · ${below.length} parts · under root ${under.get(at)?.join(", ")}`); }
  console.log("");
}

if (has("--text")) {
  if (!at && !run) { console.error("--text needs a route"); process.exit(1); }
  console.log((run ?? [at!]).flatMap((id) => [...text(id, 1), ""]).join("\n").replace(/\n{3,}/g, "\n\n"));
} else if (has("--depths")) {
  const seen = new Set(below); let layer = [...below], d = 1;
  const rows: { d: number; n: number; w: number; s: number; ts: Map<string, number> }[] = [];
  while (layer.length) {
    const r = { d, n: layer.length, w: 0, s: 0, ts: new Map<string, number>() }, next: string[] = [];
    for (const id of layer) { const t = tn(all.get(id)); if (t === "word") r.w++; r.s += stringWords(id); r.ts.set(t, (r.ts.get(t) ?? 0) + 1); for (const p of parts(id)) if (!seen.has(p)) { seen.add(p); next.push(p); } }
    rows.push(r); layer = next; d++;
  }
  const max = Math.max(...rows.map((r) => r.n));
  console.log(`layer  holons ${"".padEnd(16)}  words  in strings  types there`);
  for (const r of rows) console.log(`${String(r.d).padStart(5)} ${String(r.n).padStart(7)} ${bar(r.n, max, 16)} ${String(r.w).padStart(6)} ${String(r.s).padStart(10)}  ${top(r.ts, 5)}`);
} else if (has("--points")) {
  const inside = new Set<string>(); { const st = at ? [at] : [...roots]; st.forEach((x) => inside.add(x)); while (st.length) { const x = st.pop()!; for (const p of parts(x)) if (!inside.has(p)) { inside.add(p); st.push(p); } } }
  const rootsOf = (id: string) => (under.get(id) ?? []).map((n) => `${n} "${name(roots[n - 1]!)}"`).join(" & ") || `(${tn(all.get(id))}, held by nothing)`;
  const fields = new Map<string, number>(), out = new Map<string, number>(), into = new Map<string, number>();
  const add = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const [from, ps] of across) for (const [k, to] of ps) {
    const fi = inside.has(from), ti = inside.has(to);
    if (fi) add(fields, `${tn(all.get(from))}.${k} → ${tn(all.get(to))}`);
    if (!at) { if ((under.get(from) ?? []).join() !== (under.get(to) ?? []).join()) add(out, `${rootsOf(from)} → ${rootsOf(to)}`); }
    else if (fi && !ti) add(out, rootsOf(to));
    else if (!fi && ti) add(into, rootsOf(from));
  }
  const show = (title: string, m: Map<string, number>) => { console.log(title); for (const [k, n] of [...m].sort((a, b) => b[1] - a[1]).slice(0, limit)) console.log(`${String(n).padStart(7)}  ${k}`); console.log(""); };
  show("pointings from beneath, by field:", fields);
  show(at ? "out, to the roots they reach:" : "between roots:", out);
  if (at) show("in, from the roots they come from:", into);
} else if (has("--digest")) {
  // Each holon is read once, at its first reach: a part shared with an earlier
  // piece adds nothing to a later one. Siblings are packed into runs up to the
  // budget; a whole over the budget is opened and its parts packed in turn.
  const budget = Number(flag("--digest"));
  const covered = new Set<string>();
  const fresh = (id: string) => { const seen = new Set([id]), st = [id]; let w = 0; while (st.length) { const x = st.pop()!; if (covered.has(x)) continue; if (tn(all.get(x)) === "word") w++; w += stringWords(x); for (const p of parts(x)) if (!seen.has(p)) { seen.add(p); st.push(p); } } return Math.round(w * tokensPerWord); };
  const cover = (id: string) => { const st = [id]; while (st.length) { const x = st.pop()!; if (covered.has(x)) continue; covered.add(x); st.push(...parts(x)); } };
  const pieces: { from: string; to: string; ids: string[]; t: number; within: string }[] = [];
  const pack = (ids: string[], prefix: string, within: string) => {
    let cur: (typeof pieces)[number] | null = null;
    const flush = () => { if (cur) pieces.push(cur); cur = null; };
    ids.forEach((id, i) => {
      if (covered.has(id)) return;
      const r = prefix + (i + 1), t = fresh(id);
      if (t === 0) { cover(id); return; }
      if (t > budget && parts(id).length) { flush(); covered.add(id); pack(parts(id), r + ".", `${tn(all.get(id))} "${name(id)}"`); return; }
      if (cur && cur.t + t > budget) flush();
      cur ??= { from: r, to: r, ids: [], t: 0, within };
      cur.to = r; cur.ids.push(id); cur.t += t; cover(id);
    });
    flush();
  };
  pack(below, base, at ? `${tn(all.get(at))} "${name(at)}"` : "the roots");
  const total = pieces.reduce((a, p) => a + p.t, 0);
  const span = (p: (typeof pieces)[number]) => (p.from === p.to ? p.from : `${p.from}-${p.to.split(".").at(-1)}`);
  console.log(`${pieces.length} pieces of at most ${budget} tokens, ≈${total} in all, each holon counted once (a piece over the budget is a holon with no parts to open)`);
  const max = Math.max(...pieces.map((p) => p.t));
  for (const p of pieces.slice(0, limit)) console.log(`${span(p).padEnd(12)} ${String(p.t).padStart(6)} ${bar(p.t, max)} ${p.ids.length > 1 ? `${p.ids.length} parts of ${p.within}: "${name(p.ids[0]!)}" … "${name(p.ids.at(-1)!)}"` : `${tn(all.get(p.ids[0]!))} "${name(p.ids[0]!)}" in ${p.within}`}`);
  if (pieces.length > limit) console.log(`… ${pieces.length - limit} more (--limit)`);
  console.log(`\nread one: bun src/tools/probe.ts <route> ${chosen.length < Object.keys(stores).length ? (only ? `--only ${only.join(",")} ` : `--without ${[...without].join(",")} `) : ""}--text`);
} else if (flag("--layer") || flag("--type")) {
  const want = flag("--layer") ? Number(flag("--layer")) : Infinity, type = flag("--type");
  const hits: [string, string][] = [], seen = new Set<string>();
  each((id, r, d) => {
    if ((d === want || want === Infinity) && (!type || tn(all.get(id)) === type) && !seen.has(id)) { seen.add(id); hits.push([r, id]); if (want === Infinity) return false; }
    return d < want;
  });
  const by = new Map<string, number>(); for (const [, id] of hits) by.set(tn(all.get(id)), (by.get(tn(all.get(id))) ?? 0) + 1);
  console.log(`${hits.length} at ${flag("--layer") ? "layer " + want : "any layer"}${type ? ", of type " + type : ""}: ${top(by, 8)}`);
  const max = Math.max(...hits.map(([, id]) => tokens(measure(id))));
  for (const [r, id] of hits.slice(0, limit)) console.log(row(r, id, max));
  if (hits.length > limit) console.log(`… ${hits.length - limit} more (--limit)`);
} else {
  const layers = Number(flag("--layers") ?? 1), max = Math.max(...below.map((id) => tokens(measure(id))));
  let shown = 0;
  each((id, r, d) => { if (shown >= limit) return false; shown++; console.log(row(r, id, max, "  ".repeat(d - 1))); return d < layers; });
  if (shown >= limit) console.log(`… more (--limit)`);
}
