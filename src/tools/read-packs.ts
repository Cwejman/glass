// Reads a store back from its packs alone, as a client on a static host would:
// the ref, then each pack found by the commit chain, each object fetched by
// its byte range and checked against its name. Every holon the head commit's
// index reaches is compared with its source holon in store/.
// Usage: bun src/tools/read-packs.ts [store dir]

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { canonical } from "../store/canonical.ts";
import { nameOfText } from "../store/name.ts";

const dir = process.argv[2] ?? "store";
const [head, headPack] = (await readFile(join(dir, "refs/main"), "utf8")).trim().split(" ");
const where = new Map<string, [string, number, number]>(); // name -> pack hex, offset, length
let reads = 0;
async function object(name: string): Promise<any> {
  const at = where.get(name);
  if (!at) throw new Error(`${name} is in no pack read so far`);
  const [hex, offset, length] = at;
  const bytes = (await Bun.file(join(dir, "packs", `${hex}.pack`)).slice(offset, offset + length).text());
  reads++;
  if ((await nameOfText(bytes)) !== name) throw new Error(`${name} does not match its bytes`);
  return JSON.parse(bytes);
}
async function readIndexOf(pack: string) {
  const hex = pack.slice("sha256-".length);
  const idx = await Bun.file(join(dir, "packs", `${hex}.idx`)).json();
  for (const [name, [o, n]] of Object.entries(idx.objects) as [string, [number, number]][]) if (!where.has(name)) where.set(name, [hex, o, n]);
}

// Walk the commit chain back, learning every pack.
let commits = 0, packs = 0;
for (let c: string | null = head!, p: string | null = headPack!; c; ) {
  await readIndexOf(p!); packs++;
  const commit = await object(c); commits++;
  c = commit.parent; p = commit.parentPack;
}
// Read the head's index, down to every version.
const index = await object((await object(head!)).index);
const versions: any[] = [];
async function walk(name: string) {
  const node = await object(name);
  if (node.kind === "index-leaf") for (const v of Object.values(node.versions)) versions.push(await object(v as string));
  else for (const child of Object.values(node.branches)) await walk(child as string);
}
if (index.holons) await walk(index.holons);

// Compare with the source holons.
const rd = async (f: string) => { const v = await Bun.file(f).json(); return Array.isArray(v) ? v : [v]; };
const union = (await rd("store/union.json"))[0];
const source = new Map<string, any>();
for (const f of [...union.body.stores.map((s: any) => s.file), "store/union.json", "store/slices.json"]) for (const h of await rd(f)) source.set(h.id, h);
let same = 0; const differ: string[] = [];
for (const v of versions) {
  const h = source.get(v.id);
  const back = { id: v.id, instance: v.instance, ...(v.name ? { name: v.name } : {}), ...(v.mould ? { mould: v.mould } : {}), body: v.body };
  const src = h && { id: h.id, instance: h.instance, ...(h.name ? { name: h.name } : {}), ...(h.mould ? { mould: h.mould } : {}), body: h.body };
  if (src && canonical(back) === canonical(src)) same++; else differ.push(v.id);
}
console.log(`${dir}: ${commits} commits over ${packs} packs; ${versions.length} holons read back, ${same} identical to their source${differ.length ? `, ${differ.length} differ` : ""}; ${reads} objects fetched by range, each checked by its name; ${Object.keys(index.names).length} names`);
