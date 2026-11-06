// Births the store as packs, one commit per slice, in the primitives as they
// stand: a version keeps a holon's id, instance, name, mould and body, the
// name and mould beside the body. Each commit writes one pack holding only the
// objects it adds, beside an index of where each sits in it, and never
// changes either again. The paper is a store of its own, by its licence.
//
//   store/packs/<hash>.pack   the objects a commit adds, one canonical JSON per line
//   store/packs/<hash>.idx    each object's name -> [byte offset, length] in the pack
//   store/refs/main           "<commit> <pack>": the one line that ever changes
//
// A commit names its parent and the pack its parent is in, so from the ref
// every pack is found, on any static host, by range requests alone.
// Usage: bun src/tools/pack.ts [--check]

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonical } from "../store/canonical.ts";
import { nameOfText, type Name } from "../store/name.ts";

// The index tree, keyed by the start of each id, its moment of birth, so
// holons born together share leaves and a commit rewrites only the leaves of
// what it adds. (The engine's tree, src/store/tree.ts, reads ids from the
// end; this is the change the store is to take.)
const leafSize = 64;
async function grow(objects: any, at: Name | undefined, updates: ReadonlyMap<string, Name>, depth = 0): Promise<Name> {
  const here = at ? await objects.get(at) : { kind: "index-leaf", depth, versions: {} };
  if (here.kind === "index-leaf") {
    const versions = { ...here.versions, ...Object.fromEntries(updates) };
    if (Object.keys(versions).length <= leafSize) return objects.put({ kind: "index-leaf", depth, versions });
    return objects.put({ kind: "index-branch", depth, branches: await branchesOf(objects, undefined, Object.entries(versions) as [string, Name][], depth) });
  }
  return objects.put({ kind: "index-branch", depth, branches: await branchesOf(objects, here.branches, [...updates], depth) });
}
async function branchesOf(objects: any, before: Record<string, Name> | undefined, entries: [string, Name][], depth: number) {
  const groups = new Map<string, [string, Name][]>();
  for (const e of entries) { const c = e[0][depth]!; (groups.get(c) ?? groups.set(c, []).get(c)!).push(e); }
  const grown = await Promise.all([...groups].map(async ([c, g]) => [c, await grow(objects, before?.[c], new Map(g), depth + 1)] as const));
  return { ...before, ...Object.fromEntries(grown) };
}

const rd = async (f: string) => { const v = await Bun.file(f).json(); return Array.isArray(v) ? v : [v]; };
const union = (await rd("store/union.json"))[0];
const slices = (await rd("store/slices.json")).filter((h: any) => h.body?.roots).sort((a: any, b: any) => a.body.order - b.body.order);
const all = new Map<string, any>();
for (const f of [...union.body.stores.map((s: any) => s.file), "store/union.json", "store/slices.json"])
  for (const h of await rd(f)) all.set(h.id, h);

// The two stores, and which slices each is born from.
const paperWholes = new Set(["paper base", "paper branches"]);
const stores = [
  { dir: "store", slices: slices.filter((s: any) => !paperWholes.has(s.body.whole)) },
  { dir: "store/paper", slices: slices.filter((s: any) => paperWholes.has(s.body.whole)) },
];

// A holon's moment of birth, read from its ULID.
const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const bornAt = (id: string) => new Date([...id.slice(0, 10)].reduce((t, c) => t * 32 + alphabet.indexOf(c), 0)).toISOString();

// What a slice packs, derived exactly as slices.ts derives it.
const lexemeTypes = new Set([...all.values()].filter((h) => h.name === "lexeme" && h.mould).map((h) => h.id));
const rootOf = new Map<string, number>();
slices.forEach((s: any, i: number) => s.body.roots.forEach((r: any) => { if (!rootOf.has(r.$ref)) rootOf.set(r.$ref, i); }));
const packedAll = new Set<string>();
function packs(slice: any, i: number): string[] {
  const out: string[] = [];
  const reach = (id: string, root = false) => {
    if (packedAll.has(id) || !all.has(id)) return;
    const h = all.get(id);
    if (h.mould && !root) return;
    if (!root && (rootOf.get(id) ?? -1) > i) return;
    packedAll.add(id); out.push(id);
    const mould = all.get(h.instance?.[0])?.mould ?? {};
    for (const [k, v] of Object.entries(h.body ?? {})) {
      const walk = (x: any): void => {
        if (Array.isArray(x)) x.forEach(walk);
        else if (x && typeof x === "object") {
          if (x.$ref) { const t = all.get(x.$ref); if (x.$holds ?? mould[k]?.holds ?? false ? true : t && lexemeTypes.has(t.instance?.[0])) reach(x.$ref); }
          Object.values(x).forEach(walk);
        }
      };
      walk(v);
    }
  };
  for (const r of slice.body.roots) reach(r.$ref, true);
  return out;
}
const sliceIndex = new Map(slices.map((s: any, i: number) => [s.id, i]));

for (const store of stores) {
  await rm(join(store.dir, "packs"), { recursive: true, force: true });
  await rm(join(store.dir, "refs"), { recursive: true, force: true });
  await mkdir(join(store.dir, "packs"), { recursive: true });
  await mkdir(join(store.dir, "refs"), { recursive: true });
  const known = new Map<Name, string>();       // every object written so far: name -> its text
  let fresh: [Name, string][] = [];              // the objects this commit adds
  const objects = {
    async put(o: unknown) { const text = canonical(o); const name = await nameOfText(text); if (!known.has(name)) { known.set(name, text); fresh.push([name, text]); } return name; },
    async get(name: Name) { const t = known.get(name); if (!t) throw new Error(`no ${name}`); return JSON.parse(t); },
    async seed() {},
  } as any;
  let root: Name | undefined, parent: Name | null = null, parentPack: Name | null = null;
  const names: Record<string, string> = {};
  const clashes: string[] = [];
  let bytes = 0, count = 0;
  for (const slice of store.slices) {
    fresh = [];
    const ids = packs(slice, sliceIndex.get(slice.id)!);
    const updates = new Map<string, Name>();
    for (const id of ids) {
      const h = all.get(id);
      const version = { kind: "version", id: h.id, prev: null, instance: h.instance, ...(h.name ? { name: h.name } : {}), ...(h.mould ? { mould: h.mould } : {}), body: h.body };
      updates.set(id, await objects.put(version));
      if (h.name) { if (names[h.name] && names[h.name] !== h.id) clashes.push(h.name); else names[h.name] = h.id; }
    }
    if (updates.size) root = await grow(objects, root, updates);
    const index = await objects.put({ kind: "index", names, holons: root ?? null });
    const at = bornAt(slice.body.roots[0]?.$ref ?? slice.id);
    const commit = await objects.put({ kind: "commit", parent, parentPack, at, index, says: slice.body.title });
    // The pack and its index: the objects in the order written, each on a line.
    const lines: string[] = []; const idx: Record<string, [number, number]> = {}; let offset = 0;
    for (const [name, text] of fresh) { const n = Buffer.byteLength(text); idx[name] = [offset, n]; lines.push(text); offset += n + 1; }
    const packText = lines.join("\n") + "\n";
    const pack = await nameOfText(packText);
    const hex = pack.slice("sha256-".length);
    await writeFile(join(store.dir, "packs", `${hex}.pack`), packText);
    await writeFile(join(store.dir, "packs", `${hex}.idx`), canonical({ kind: "pack-index", pack, objects: idx }) + "\n");
    parent = commit; parentPack = pack; bytes += Buffer.byteLength(packText); count++;
  }
  await writeFile(join(store.dir, "refs", "main"), `${parent} ${parentPack}\n`);
  console.log(`${store.dir}: ${count} commits, ${count * 2} pack files, ${(bytes / 1048576).toFixed(1)} MB, ${known.size} objects${clashes.length ? `; names held by more than one holon, the first kept: ${[...new Set(clashes)].join(", ")}` : ""}`);
}
