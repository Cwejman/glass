// Turns each raw branch an agent wrote into holons over the base, checks it,
// and digests the branches side by side.
// Usage: bun branches.ts <glass repo> <ref dir> <raw dir>

const [repo, dir, raw] = process.argv.slice(2);
const { newId } = await import(`${repo}/src/store/id.ts`);
const keyOf: Record<string, string> = await Bun.file(`${dir}/keys.json`).json();
const base = await Bun.file(`${dir}/branches/base.json`).json();
const document = base[0].id;

let tick = 0;
const id = () => newId(Date.UTC(2026, 10, 6, 20, 0, 0) + tick++, seeded(tick + 104729));
function seeded(n: number) {
  const r = new Uint8Array(16);
  let x = (n * 2654435761) >>> 0;
  for (let i = 0; i < 16; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; r[i] = x & 255; }
  return r;
}
const ref = (to: string) => ({ $ref: to });

// The two types every branch shares, kept once.
const typesPath = `${dir}/branches/types.json`;
let types = await Bun.file(typesPath).exists() ? await Bun.file(typesPath).json() : null;
if (!types) {
  types = [
    { id: id(), instance: [], name: "branch", mould: {
      reads: { says: "The document whose held space it is drawn over.", shape: "ref", holds: false },
      top: { says: "Its biggest understanding.", shape: "ref", holds: true },
      understandings: { says: "Every understanding it draws, top included.", shape: { set: "ref" }, holds: true },
    }, body: { says: "A branch over a held space: one isolated reading, its own holarchy of understandings, a store of its own beside the base. It does not record what steered it." } },
    { id: id(), instance: [], name: "understanding", mould: {
      title: { says: "The understanding in a few words.", shape: "string" },
      prose: { says: "The understanding, in the reader's own words.", shape: "string" },
      matters: { says: "What matters at its level: the variable that governs this height of the held space.", shape: "string" },
      parts: { says: "What stands beneath it: understandings, and paragraphs or figures of the base.", shape: { list: "ref" }, holds: true },
    }, body: { says: "One understanding in a branch, the rule's way: the biggest first, each breaking down into smaller ones, the smallest holding the base." } },
  ];
  await Bun.write(typesPath, "[\n" + types.map((h: unknown) => "  " + JSON.stringify(h)).join(",\n") + "\n]\n");
}
const [Branch, Understanding] = types.map((t: { id: string }) => t.id);

type U = { key: string; title: string; prose: string; matters: string; parts: string[] };
type Raw = { top: string; understandings: U[] };
const digest: { n: string; us: U[]; top: string; depthOf: Map<string, number>; held: Map<string, number> }[] = [];

// The matrix: which model read, and whether its seed came from inside the held space.
const model = (n: number) => n <= 10 ? "opus" : ({ 11: "haiku", 12: "sonnet", 13: "fable", 14: "haiku", 15: "sonnet", 16: "fable", 17: "opus" } as Record<number, string>)[n]!;
const seedFrom = (n: number) => n <= 13 ? "inside" : "outside";
for (const file of [...new Bun.Glob("branch-*.json").scanSync(raw!)].sort()) {
  const n = file.match(/branch-(\d+)/)![1]!;
  const out = `${dir}/branches/branch-${n}.json`;
  const exists = await Bun.file(out).exists();
  const problems: string[] = [];
  let r: Raw;
  try { r = await Bun.file(`${raw}/${file}`).json(); } catch (e) { console.log(n, "unreadable:", String(e)); continue; }
  const us = new Map(r.understandings.map((u) => [u.key, u]));
  if (!us.has(r.top)) problems.push(`top ${r.top} missing`);
  const heldBy = new Map<string, number>();
  for (const u of r.understandings) for (const p of u.parts) {
    if (p.startsWith("U") && !us.has(p)) problems.push(`${u.key} holds missing ${p}`);
    if (p.startsWith("P") && !keyOf[p]) problems.push(`${u.key} holds unknown ${p}`);
    if (p.startsWith("U")) heldBy.set(p, (heldBy.get(p) ?? 0) + 1);
  }
  for (const u of r.understandings) if (u.key !== r.top && !heldBy.has(u.key)) problems.push(`${u.key} held by nothing`);
  // depth by shortest path from the top; a cycle shows as a revisit on the path
  const depthOf = new Map<string, number>(); const held = new Map<string, number>();
  const walk = (k: string, d: number, path: Set<string>) => {
    if (path.has(k)) { problems.push(`cycle at ${k}`); return; }
    if ((depthOf.get(k) ?? Infinity) <= d) return;
    depthOf.set(k, d);
    for (const p of us.get(k)?.parts ?? []) {
      if (p.startsWith("U")) walk(p, d + 1, new Set([...path, k]));
      else if ((held.get(p) ?? Infinity) > d + 1) held.set(p, d + 1);
    }
  };
  walk(r.top, 0, new Set());
  if (problems.length) { console.log(`branch ${n}: ${problems.slice(0, 6).join("; ")}`); continue; }

  const fresh = exists ? id : () => newId();
  if (exists) {
    // Already born: keep every id, and only say its place in the matrix.
    const hs = await Bun.file(out).json();
    hs[0].body.model = model(+n); hs[0].body.seedFrom = seedFrom(+n);
    await Bun.write(out, "[\n" + hs.map((h: unknown) => "  " + JSON.stringify(h)).join(",\n") + "\n]\n");
    digest.push({ n, us: r.understandings, top: r.top, depthOf, held });
    continue;
  }
  const idOf = new Map(r.understandings.map((u) => [u.key, fresh()]));
  const holons = r.understandings.map((u) => ({
    id: idOf.get(u.key)!, instance: [Understanding],
    body: { title: u.title, prose: u.prose, matters: u.matters, parts: u.parts.map((p) => ref(p.startsWith("U") ? idOf.get(p)! : keyOf[p]!)) },
  }));
  const branch = { id: fresh(), instance: [Branch], name: `branch-${n}`, body: {
    reads: ref(document), top: ref(idOf.get(r.top)!), understandings: [...idOf.values()].map(ref),
    model: model(+n), seedFrom: seedFrom(+n),
  } };
  await Bun.write(`${dir}/branches/branch-${n}.json`, "[\n" + [branch, ...holons].map((h) => "  " + JSON.stringify(h)).join(",\n") + "\n]\n");
  digest.push({ n, us: r.understandings, top: r.top, depthOf, held });
}

// The digest: shape, the top of each gradient, what matters by height, and
// how the branches meet over the base.
console.log("\nBRANCH  model   seed     understandings  depth  paragraphs held  top");
for (const b of digest) {
  const depth = Math.max(...b.depthOf.values());
  const t = b.us.find((u) => u.key === b.top)!;
  console.log(`  ${b.n}    ${model(+b.n).padEnd(7)} ${seedFrom(+b.n).padEnd(8)} ${String(b.us.length).padStart(3)}         ${depth}       ${String(b.held.size).padStart(3)}            ${t.title}`);
}
console.log("\nWHAT MATTERS, BY HEIGHT (0 = top)");
for (const b of digest) {
  const by: string[][] = [];
  for (const u of b.us) (by[b.depthOf.get(u.key)!] ??= []).push(u.matters);
  console.log(`  ${b.n}: ` + by.map((m, d) => `${d}: ${m[0]}${m.length > 1 ? ` (+${m.length - 1})` : ""}`).join("  |  "));
}
const all = Object.keys(keyOf);
const count = new Map(all.map((p) => [p, digest.filter((b) => b.held.has(p)).length]));
const spread: Record<number, number> = {};
for (const c of count.values()) spread[c] = (spread[c] ?? 0) + 1;
console.log("\nPARAGRAPHS BY HOW MANY BRANCHES HOLD THEM", JSON.stringify(spread));
const near = all.map((p) => [p, digest.filter((b) => (b.held.get(p) ?? 99) <= 2).length] as const).filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]);
console.log("held within two levels of the top by 3+ branches:", near.map(([p, c]) => `${p}(${c})`).join(" ") || "none");
console.log("\nJACCARD OF HELD PARAGRAPHS");
console.log("      " + digest.map((b) => b.n.padStart(5)).join(""));
for (const a of digest) console.log("  " + a.n + "  " + digest.map((b) => {
  const i = [...a.held.keys()].filter((p) => b.held.has(p)).length;
  const u = new Set([...a.held.keys(), ...b.held.keys()]).size;
  return (i / u).toFixed(2).padStart(5);
}).join(""));
