// The store as packs: reading it and adding to it. A store is a directory
// holding refs/main and packs/. Each commit is one pack of the objects it
// adds, beside an index of where each sits; nothing written is ever changed.
//
//   refs/main            "<commit> <pack>"
//   packs/<hash>.pack    canonical JSON objects, one per line
//   packs/<hash>.idx     {kind: "pack-index", pack, objects: {name: [offset, length]}}
//
// A version: {kind, id, prev, instance, name?, mould?, body}; an index:
// {kind, names, holons}; a commit: {kind, parent, parentPack, at, index, says}.
// The index tree is keyed by the start of each id, its moment of birth.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonical } from "../store/canonical.ts";
import { nameOfText, type Name } from "../store/name.ts";

export type Holon = { id: string; instance: string[]; name?: string; mould?: any; body: any };
export type Store = Awaited<ReturnType<typeof open>>;

export async function open(dir: string) {
  const [head, headPack] = (await readFile(join(dir, "refs/main"), "utf8")).trim().split(" ") as [Name, Name];
  const where = new Map<string, [string, number, number]>();
  const written = new Map<string, string>();
  const learn = async (pack: string) => {
    const hex = pack.slice("sha256-".length);
    const idx = await Bun.file(join(dir, "packs", `${hex}.idx`)).json();
    for (const [n, [o, l]] of Object.entries(idx.objects) as [string, [number, number]][]) if (!where.has(n)) where.set(n, [hex, o, l]);
  };
  async function get(name: string): Promise<any> {
    const fresh = written.get(name);
    if (fresh) return JSON.parse(fresh);
    const at = where.get(name);
    if (!at) throw new Error(`${name} is in no pack of ${dir}`);
    const text = await Bun.file(join(dir, "packs", `${at[0]}.pack`)).slice(at[1], at[1] + at[2]).text();
    if ((await nameOfText(text)) !== name) throw new Error(`${name} does not match its bytes`);
    return JSON.parse(text);
  }
  const log: { commit: Name; at: string; says: string }[] = [];
  for (let c: string | null = head, p: string | null = headPack; c; ) {
    await learn(p!);
    const commit = await get(c);
    log.push({ commit: c as Name, at: commit.at, says: commit.says });
    c = commit.parent; p = commit.parentPack;
  }
  const index = await get((await get(head)).index);
  // Every holon the head holds: its id, its version's name, and the holon.
  async function holons() {
    const out = new Map<string, { version: Name; holon: Holon }>();
    const walk = async (name: string) => {
      const node = await get(name);
      if (node.kind === "index-leaf") for (const [id, v] of Object.entries(node.versions) as [string, Name][]) {
        const { id: _, kind, prev, ...rest } = await get(v);
        out.set(id, { version: v, holon: { id, ...rest } as Holon });
      } else for (const child of Object.values(node.branches)) await walk(child as string);
    };
    if (index.holons) await walk(index.holons);
    return out;
  }
  return { dir, head, headPack, index, log: log.reverse(), get, holons, written };
}

// Adds one commit: the holons given, each a new version pointing back at the
// one before. Only what this commit adds goes into its pack.
export async function commit(store: Store, holons: Holon[], says: string, at = new Date().toISOString()) {
  const fresh: [Name, string][] = [];
  const put = async (o: unknown) => {
    const text = canonical(o); const name = await nameOfText(text);
    if (!store.written.has(name)) { store.written.set(name, text); fresh.push([name, text]); }
    return name;
  };
  const objects = { get: store.get, put };
  const before = await store.holons();
  const updates = new Map<string, Name>();
  const names = { ...store.index.names };
  for (const h of holons) {
    const version = { kind: "version", id: h.id, prev: before.get(h.id)?.version ?? null, instance: h.instance, ...(h.name ? { name: h.name } : {}), ...(h.mould ? { mould: h.mould } : {}), body: h.body };
    updates.set(h.id, await put(version));
    if (h.name && !names[h.name]) names[h.name] = h.id;
  }
  const root = await grow(objects, store.index.holons ?? undefined, updates);
  const index = await put({ kind: "index", names, holons: root });
  const c = await put({ kind: "commit", parent: store.head, parentPack: store.headPack, at, index, says });
  const lines: string[] = []; const idx: Record<string, [number, number]> = {}; let offset = 0;
  for (const [n, text] of fresh) { const l = Buffer.byteLength(text); idx[n] = [offset, l]; lines.push(text); offset += l + 1; }
  const packText = lines.join("\n") + "\n";
  const pack = await nameOfText(packText);
  const hex = pack.slice("sha256-".length);
  await mkdir(join(store.dir, "packs"), { recursive: true });
  await writeFile(join(store.dir, "packs", `${hex}.pack`), packText);
  await writeFile(join(store.dir, "packs", `${hex}.idx`), canonical({ kind: "pack-index", pack, objects: idx }) + "\n");
  await writeFile(join(store.dir, "refs", "main"), `${c} ${pack}\n`);
  return { commit: c, pack, objects: fresh.length, bytes: Buffer.byteLength(packText) };
}

// The index tree, keyed by the start of each id.
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

// The field: every store under store/ read as one, the paper's where it is present.
export async function field() {
  const all = new Map<string, Holon>();
  for (const dir of ["store", "store/paper"]) {
    if (!(await Bun.file(join(dir, "refs/main")).exists())) continue;
    for (const [id, { holon }] of await (await open(dir)).holons()) all.set(id, holon);
  }
  return all;
}
