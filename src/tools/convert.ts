// The one conversion: every store from packs to blocks, written into a directory
// apart and proved before anything is replaced. It reads the packs itself, since
// the code that read them went with them; they stay in git's history.
// Usage: bun src/tools/convert.ts <from store/> <into>
//
// Proved through the new files alone: every version recomputes to its old name,
// and the field at every old commit equals the index that commit held.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonical } from "../store/canonical.ts";
import { nameAt, nextName, open, sha } from "./blocks.ts";

const [from, into] = process.argv.slice(2);
if (!from || !into) throw new Error("usage: convert.ts <from store/> <into>");
const moment = Date.parse("2026-11-08T20:00:00.000Z"), at = new Date(moment).toISOString();
const blockSize = 64 * 1024;
const size = (t: string) => Buffer.byteLength(t) + 1;

const stores: any[] = [["main", ""], ["paper", "paper"], ["paper-readings", "paper-readings"]].map(([name, sub], si) => {
  const dir = join(from, sub!);
  const objs = new Map<string, any>();
  for (const f of readdirSync(join(dir, "packs"))) if (f.endsWith(".pack")) for (const l of readFileSync(join(dir, "packs", f), "utf8").split("\n")) if (l) objs.set("sha256-" + sha(l), JSON.parse(l));
  const commits: any[] = [], commitNames: string[] = [];
  for (let c: any = readFileSync(join(dir, "refs/main"), "utf8").trim().split(" ")[0]; c; c = objs.get(c).parent) { commits.push(objs.get(c)); commitNames.push(c); }
  commits.reverse(); commitNames.reverse();
  const memo = new Map<string, [string, string][]>();
  const entries = (n: string): [string, string][] => { if (memo.has(n)) return memo.get(n)!; const x = objs.get(n); const r: any = x.kind === "index-leaf" ? Object.entries(x.versions) : Object.values(x.branches).flatMap((c: any) => entries(c)); memo.set(n, r); return r; };
  const indexAt: Map<string, string>[] = commits.map((c) => { const i = objs.get(c.index); return new Map(i.holons ? entries(i.holons) : []); });
  const headOf = indexAt[indexAt.length - 1]!;
  const versions = new Map<string, any>(); for (const [n, o] of objs) if (o.kind === "version") versions.set(n, o);
  const succ = new Map<string, string[]>(); for (const [n, v] of versions) if (v.prev) { if (!versions.has(v.prev)) throw new Error(`${name}: ${n} has no version before it in its store`); (succ.get(v.prev) ?? succ.set(v.prev, []).get(v.prev)!).push(n); }
  const seenAt = new Map<string, number>(); indexAt.forEach((m, i) => { for (const v of m.values()) if (!seenAt.has(v)) seenAt.set(v, i); });
  // Each id's last version: the head's, or for one taken out, the one held last.
  const tips = new Map<string, string[]>(); for (const [n, v] of versions) if (!succ.has(n)) (tips.get(v.id) ?? tips.set(v.id, []).get(v.id)!).push(n);
  const chosen = new Map<string, string>(); for (const [id, t] of tips) chosen.set(id, headOf.get(id) ?? t.slice().sort((a, b) => (seenAt.get(b) ?? -1) - (seenAt.get(a) ?? -1))[0]!);
  for (const [id, h] of headOf) chosen.set(id, h);
  const ids = new Set<string>(); for (const v of versions.values()) ids.add(v.id);
  return { name, si, out: join(into, sub!), commits, commitNames, indexAt, headOf, versions, succ, chosen, ids, typeNames: objs.get(commits[commits.length - 1].index).names ?? {}, nameOf: new Map<string, string>(), next: nameAt(moment + si) };
});

// A holon's parts, as the probe reads them: declared on the reference or by the mould.
const types = new Map<string, any>(); for (const s of stores) for (const [id, h] of s.headOf) { const v = s.versions.get(h); if (v.mould) types.set(id, v); }
const partsOf = (v: any, inStore: (id: string) => boolean) => {
  const out: string[] = [], mould = types.get(v.instance?.[0])?.mould ?? {};
  const walk = (x: any, k: string) => { if (!x || typeof x !== "object") return; if (typeof x.$ref === "string") { if (inStore(x.$ref) && (x.$holds === true || (x.$holds !== false && mould[k]?.holds === true))) out.push(x.$ref); return; } for (const y of Object.values(x)) walk(y, k); };
  for (const [k, x] of Object.entries(v.body ?? {}).sort(([a], [b]) => +(a === "parts") - +(b === "parts"))) walk(x, k);
  return out;
};

// Names in place order: types, then each root down its parts, the lexemes last, then
// what was taken out. Roots keep the order their old ids gave them, so routes stand.
const give = (s: any, u: string) => { if (!s.nameOf.has(u)) { s.nameOf.set(u, s.next); s.next = nextName(s.next); } return s.nameOf.get(u); };
for (const s of stores) {
  const ids: string[] = [...s.headOf.keys()].sort() as string[];
  const live = (u: string) => s.versions.get(s.headOf.get(u));
  const lexemes = new Set<string>(), held = new Set<string>(), kids = new Map<string, string[]>();
  for (const u of ids) { const v = live(u); if (v.body?.lexeme?.$ref && s.headOf.has(v.body.lexeme.$ref)) lexemes.add(v.body.lexeme.$ref); const k = partsOf(v, (x) => s.headOf.has(x)); k.forEach((x) => held.add(x)); kids.set(u, k); }
  ids.filter((u) => live(u).mould).forEach((u) => give(s, u));
  const down = (start: string) => { const st = [start]; while (st.length) { const u = st.pop()!; if (s.nameOf.has(u) || lexemes.has(u)) continue; give(s, u); const k = kids.get(u)!; for (let i = k.length - 1; i >= 0; i--) st.push(k[i]!); } };
  ids.filter((u) => !held.has(u)).forEach(down); ids.forEach(down);
  [...lexemes].sort().forEach((u) => give(s, u));
  ([...s.ids] as string[]).filter((u) => !s.headOf.has(u)).sort().forEach((u) => give(s, u));
}

// A reference becomes a name: this store's own, else the store holding it. A reference
// to an id no store holds keeps a number of its own, so it stays what it was: pointing at nothing.
const oldOf = new Map<string, string>(); for (const s of stores) for (const [u, n] of s.nameOf) oldOf.set(n, u);
const resolve = (u: string, s: any): string => { for (const t of [s, ...stores]) if (t.nameOf.has(u)) return t.nameOf.get(u); const n = give(s, u); oldOf.set(n, u); return n; };
const toNames = (x: any, s: any): any => Array.isArray(x) ? x.map((e) => toNames(e, s)) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === "$ref" && typeof v === "string" ? resolve(v, s) : toNames(v, s)])) : x;
const toOld = (x: any): any => Array.isArray(x) ? x.map(toOld) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, k === "$ref" ? oldOf.get(v as string) : toOld(v)])) : x;

for (const s of stores) {
  for (const sub of ["blocks", "log", "refs", "conversion"]) mkdirSync(join(s.out, sub), { recursive: true });
  const gen = new Map<string, number>();
  const g = (n: string): number => { const m = gen.get(n); if (m !== undefined) return m; const su = s.succ.get(n); const r = su ? 1 + Math.max(...su.map(g)) : 0; gen.set(n, r); return r; };
  for (const n of s.versions.keys()) g(n);
  const tips = new Set<string>(s.chosen.values());
  const named = (n: string): string => s.nameOf.get(s.versions.get(n).id);
  // History oldest first, a block run to each generation, so a version's prev is always written before it.
  const past = ([...s.versions.keys()] as string[]).filter((n) => !tips.has(n)).sort((a, b) => gen.get(b)! - gen.get(a)! || (named(a) < named(b) ? -1 : 1));
  const latest = ([...tips] as string[]).sort((a, b) => (named(a) < named(b) ? -1 : 1));
  const blockOf = new Map<string, string>(), all: string[] = [], table: [string, string][] = [];
  let cur: string[] = [], pending: string[] = [], inBlock = new Set<string>(), bytes = 0, first: string | null = null;
  const flush = (live: boolean) => { if (!cur.length) return; const text = cur.join("\n") + "\n", h = sha(text); writeFileSync(join(s.out, "blocks", `${h}.jsonl`), text); for (const n of pending) blockOf.set(n, h); all.push(h); if (live) table.push([h, first!]); cur = []; pending = []; inBlock = new Set(); bytes = 0; first = null; };
  const place = (n: string, live: boolean) => {
    const v = s.versions.get(n), id = named(n);
    if (v.prev && !blockOf.has(v.prev)) flush(live);
    const line: any = { body: toNames(v.body, s), id, instance: (v.instance ?? []).map((i: string) => resolve(i, s)), prev: v.prev ? blockOf.get(v.prev)! : null };
    if ("name" in v) line.name = v.name; if ("mould" in v) line.mould = toNames(v.mould, s);
    const text = canonical(line);
    if (inBlock.has(id)) flush(live);
    if (cur.length && bytes + size(text) > blockSize) flush(live);
    first ??= id; cur.push(text); pending.push(n); inBlock.add(id); bytes += size(text);
  };
  let last = -1;
  for (const n of past) { if (gen.get(n) !== last) { flush(false); last = gen.get(n)!; } place(n, false); }
  flush(false);
  for (const n of latest) place(n, true);
  flush(true);
  const ord = new Map(all.map((h, i) => [h, i]));
  // Each old commit, as what it held anew and what it took out, naming the blocks by place.
  const lines: string[] = []; let before = new Map<string, string>(), parent: string | null = null;
  s.commits.forEach((c: any, i: number) => {
    const now: Map<string, string> = s.indexAt[i]; const held: [string, number][] = [], gone: string[] = [];
    for (const [u, v] of now) if (before.get(u) !== v) held.push([s.nameOf.get(u), ord.get(blockOf.get(v)!)!]);
    for (const u of before.keys()) if (!now.has(u)) gone.push(s.nameOf.get(u));
    held.sort((a, b) => (a[0] < b[0] ? -1 : 1)); gone.sort();
    const t = canonical({ at: c.at, blocks: [], gone, held, oldHash: s.commitNames[i], parent, says: c.says });
    lines.push(t); parent = sha(t); before = now;
  });
  const idsText = canonical(Object.fromEntries([...s.nameOf]));
  writeFileSync(join(s.out, "conversion/ids.json"), idsText + "\n");
  const goneNow = ([...s.ids] as string[]).filter((u) => !s.headOf.has(u)).map((u) => s.nameOf.get(u)).sort();
  const conversion = canonical({ at, blocks: [], checkpoint: { blocks: table, gone: goneNow, moved: [] }, conversion: { blocks: all, ids: sha(idsText + "\n"), names: Object.fromEntries((Object.entries(s.typeNames) as [string, string][]).map(([k, u]) => [k, s.nameOf.get(u)])) }, gone: [], parent, says: "The store from packs to blocks: every version kept, named anew in place order, its old name kept in conversion/ids.json and each old commit's in this log" });
  const volumes: string[] = []; let buf = "";
  for (const l of lines) { buf += l + "\n"; if (Buffer.byteLength(buf) >= blockSize) { volumes.push(buf); buf = ""; } }
  if (buf) volumes.push(buf);
  volumes.push(conversion + "\n");
  volumes.forEach((t, i) => writeFileSync(join(s.out, "log", `${i}.jsonl`), t));
  writeFileSync(join(s.out, "refs/main"), `${sha(conversion)} ${volumes.length - 1}\n`);
  // The old index's map of names is kept in the conversion line, and each must still be its holon's.
  for (const [k, u] of Object.entries(s.typeNames) as [string, string][]) if (s.versions.get(s.headOf.get(u))?.name !== k) throw new Error(`${s.name}: name ${k} is not its holon's`);
}

// ---- the proof, through the new files alone
let failed = false;
for (const s of stores) {
  const r = await open(s.out);
  const hm = new Map<string, string>();
  const oldName = (h: string, id: string): string => {
    const k = h + id, m = hm.get(k); if (m) return m;
    const l = r.block(h).get(id); if (!l) throw new Error(`${id} is not in block ${h}`);
    const o: any = { kind: "version", id: oldOf.get(id), prev: l.prev ? oldName(l.prev, id) : null, instance: l.instance.map((i: string) => oldOf.get(i)), body: toOld(l.body) };
    if ("name" in l) o.name = l.name; if ("mould" in l) o.mould = toOld(l.mould);
    const n = "sha256-" + sha(canonical(o)); hm.set(k, n); return n;
  };
  const log = await r.history();
  const conv = log[log.length - 1]!.line.conversion!;
  const seen = new Set<string>();
  for (const h of conv.blocks) for (const id of r.block(h).keys()) seen.add(oldName(h, id));
  const missing = ([...s.versions.keys()] as string[]).filter((n) => !seen.has(n)).length;
  const head = await r.holons(); let liveBad = head.size === s.headOf.size ? 0 : 1;
  for (const [id, { version }] of head) if (oldName(version, id) !== s.headOf.get(oldOf.get(id))) liveBad++;
  let commitsBad = 0, compared = 0;
  for (let i = 0; i < s.commits.length; i++) { const f = await r.fieldAt(i), want: Map<string, string> = s.indexAt[i]; let bad = f.size !== want.size; for (const [id, { version }] of f) { compared++; if (want.get(oldOf.get(id)!) !== oldName(version, id)) bad = true; } if (bad) commitsBad++; if (log[i]!.line.oldHash !== s.commitNames[i] || log[i]!.line.says !== s.commits[i].says || log[i]!.line.at !== s.commits[i].at) commitsBad++; }
  let refs = 0, dangling = 0;
  for (const { holon } of head.values()) { const chk = (n: string) => { refs++; if (!oldOf.has(n)) dangling++; }; const go = (x: any) => { if (Array.isArray(x)) x.forEach(go); else if (x && typeof x === "object") { if (typeof x.$ref === "string") chk(x.$ref); for (const k in x) go(x[k]); } }; go(holon.body); go(holon.mould); holon.instance.forEach(chk); }
  const ok = !missing && !liveBad && !commitsBad && seen.size === s.versions.size && !dangling;
  failed ||= !ok;
  console.log(`${s.name}: ${ok ? "proved" : "FAILED"} · live ${head.size} of ${s.headOf.size} · versions ${seen.size} of ${s.versions.size}, ${missing} missing · commits ${s.commits.length - commitsBad} of ${s.commits.length} · ${compared} holons compared · ${refs} references, ${dangling} dangling · ${conv.blocks.length} blocks, ${log.length} log lines`);
}
if (failed) process.exit(1);
