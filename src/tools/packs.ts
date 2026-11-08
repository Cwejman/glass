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

import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonical } from "../store/canonical.ts";
import { nameOfText, type Name } from "../store/name.ts";

// The repository's store, wherever a tool is run from.
export const storeDir = join(import.meta.dir, "../../store");

export type Holon = { id: string; instance: string[]; name?: string; mould?: any; body: any };
export type Store = Awaited<ReturnType<typeof open>>;

// Reading is plain arithmetic over bytes: each pack is mapped into memory once,
// an object is the slice its index names, and the slice is checked against its
// name before it is parsed. Nothing in the read path waits; the async surface
// is kept for the callers.
export async function open(dir: string) {
  // A store with no ref yet is empty: its first commit has no parent.
  const refPath = join(dir, "refs/main");
  const [head, headPack] = (existsSync(refPath) ? readFileSync(refPath, "utf8").trim().split(" ") : [null, null]) as [Name | null, Name | null];
  const where = new Map<string, [Uint8Array, number, number]>();
  const written = new Map<string, string>();
  const packs = new Map<string, Uint8Array>();
  const bytesOf = (hex: string) => packs.get(hex) ?? packs.set(hex, Bun.mmap(join(dir, "packs", `${hex}.pack`))).get(hex)!;
  const learn = (pack: string) => {
    const hex = pack.slice("sha256-".length);
    const bytes = bytesOf(hex);
    const idx = JSON.parse(readFileSync(join(dir, "packs", `${hex}.idx`), "utf8"));
    for (const [n, [o, l]] of Object.entries(idx.objects) as [string, [number, number]][]) if (!where.has(n)) where.set(n, [bytes, o, l]);
  };
  const hasher = new Bun.CryptoHasher("sha256");
  const decoder = new TextDecoder();
  function read(name: string): any {
    const fresh = written.get(name);
    if (fresh) return JSON.parse(fresh);
    const at = where.get(name);
    if (!at) throw new Error(`${name} is in no pack of ${dir}`);
    const bytes = at[0].subarray(at[1], at[1] + at[2]);
    if ("sha256-" + hasher.update(bytes).digest("hex") !== name) throw new Error(`${name} does not match its bytes`);
    return JSON.parse(decoder.decode(bytes));
  }
  const get = async (name: string): Promise<any> => read(name);
  const log: { commit: Name; pack: Name; at: string; says: string }[] = [];
  for (let c: string | null = head, p: string | null = headPack; c; ) {
    learn(p!);
    const commit = read(c);
    log.push({ commit: c as Name, pack: p as Name, at: commit.at, says: commit.says });
    c = commit.parent; p = commit.parentPack;
  }
  const index = head ? read(read(head).index) : { kind: "index", names: {}, holons: null };
  // The versions one pack holds, in the order written: what that commit added.
  async function added(pack: string) {
    const text = decoder.decode(bytesOf(pack.slice("sha256-".length)));
    return text.split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((o) => o.kind === "version");
  }
  // Every holon the head holds: its id, its version's name, and the holon.
  async function holons() {
    const out = new Map<string, { version: Name; holon: Holon }>();
    const walk = (name: string) => {
      const node = read(name);
      if (node.kind === "index-leaf") for (const [id, v] of Object.entries(node.versions) as [string, Name][]) {
        const { id: _, kind, prev, ...rest } = read(v);
        out.set(id, { version: v, holon: { id, ...rest } as Holon });
      } else for (const child of Object.values(node.branches)) walk(child as string);
    };
    if (index.holons) walk(index.holons);
    return out;
  }
  return { dir, head, headPack, index, log: log.reverse(), get, holons, written, added };
}

// Adds one commit: the holons given, each a new version pointing back at the
// one before. Only what this commit adds goes into its pack.
export async function commit(store: Store, holons: Holon[], says: string, at = new Date().toISOString(), gone: string[] = []) {
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
  // What the commit takes out of the field: gone from its index from then on,
  // every version it had still in the packs before.
  for (const id of gone) if (before.has(id)) { updates.set(id, null as any); for (const [n, i] of Object.entries(names)) if (i === id) delete names[n]; }
  const root = await grow(objects, store.index.holons ?? undefined, updates);
  const index = await put({ kind: "index", names, holons: root });
  const c = await put({ kind: "commit", parent: store.head, parentPack: store.headPack, at, index, says });
  const lines: string[] = []; const idx: Record<string, [number, number]> = {}; let offset = 0;
  for (const [n, text] of fresh) { const l = Buffer.byteLength(text); idx[n] = [offset, l]; lines.push(text); offset += l + 1; }
  const packText = lines.join("\n") + "\n";
  const pack = await nameOfText(packText);
  const hex = pack.slice("sha256-".length);
  await mkdir(join(store.dir, "packs"), { recursive: true });
  await mkdir(join(store.dir, "refs"), { recursive: true });
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
    const versions: Record<string, Name> = { ...here.versions, ...Object.fromEntries(updates) };
    for (const [id, v] of Object.entries(versions)) if (v === null) delete versions[id];
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

// The field: every store under store/ read as one.
export async function field() {
  const all = new Map<string, Holon>();
  const dirs = [storeDir, ...[...new Bun.Glob("*/refs/main").scanSync(storeDir)].map((f) => join(storeDir, f.split("/")[0]!))];
  for (const dir of dirs) {
    if (!(await Bun.file(join(dir, "refs/main")).exists())) continue;
    for (const [id, { holon }] of await (await open(dir)).holons()) all.set(id, holon);
  }
  return all;
}
