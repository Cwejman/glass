// The stores this repository holds, found where they lie: every folder keeping a .glass/
// is one, beside what it is about, and each is named by its own root, the holon its
// latest commit is owned by (the author's, 2026-11-10: a store is a field with one root,
// which says what it stands on, never where it is served). No file says which folder
// holds which store. The folder the search begins in comes first, the rest the nearer
// first, then by where they lie; what is built or installed is not searched.
//
// Each .glass/ is a strata store: its history, a head and the blobs it reaches, kept in
// git, and its index within, at index/, rebuilt from the history when it is missing.
// Whatever reads or writes the field from this machine does it through the engine here,
// engineHere, every store mounted as itself and those named written.

import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { engine, type Engine } from "./engine/next/engine.ts";
import { sameThread } from "./runtime/runtime.ts";
import type { Holon, Store } from "./stores/store.ts";
import { commitAt, headAt, latestCommit } from "./stores/strata/head.ts";
import { folderStorages } from "./stores/strata/storage/folder.ts";
import { strata } from "./stores/strata/strata.ts";

export type { Holon, Store };

// A store opened from its folder.
export const open = (folder: string): Store => strata(folderStorages(folder));

const unsearched = new Set(["node_modules", "dist", ".git"]);

// Every .glass/ beneath a folder that keeps a store's history, the folder's own first.
function glassFolders(dir: string): string[] {
  const found: string[] = [];

  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".glass") {
        if (existsSync(join(at, entry.name, "head"))) found.push(join(at, entry.name));
      } else if (!entry.name.startsWith(".") && !unsearched.has(entry.name)) walk(join(at, entry.name));
    }
  };
  walk(dir);

  const depth = (folder: string) => relative(dir, folder).split("/").length;
  return found.sort((x, y) => depth(x) - depth(y) || (x < y ? -1 : 1));
}

export type Found = { folder: string; root: string };

const decoder = new TextDecoder();
const linesOf = (bytes: Uint8Array) =>
  decoder
    .decode(bytes)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

// A store's latest head and its root, the holon its latest commit is owned by.
async function rootOf(folder: string) {
  const { history } = folderStorages(folder);
  const latest = await latestCommit(history);
  if (!latest) throw new Error(`the store at ${folder} has no commit`);

  const { own } = await commitAt(history, latest);
  return { head: await headAt(history, latest), root: own };
}

// The stores beneath a folder, each by the name its root gives it.
export async function storesIn(dir: string): Promise<Map<string, Found>> {
  const found = new Map<string, Found>();

  for (const folder of glassFolders(dir)) {
    const { head, root } = await rootOf(folder);
    const [holon] = linesOf(await open(folder).read(head, { holon: root })) as Holon[];
    if (!holon) throw new Error(`the store at ${folder} does not hold its root, ${root}`);
    if (!holon.name) throw new Error(`the root of the store at ${folder} has no name`);
    if (found.has(holon.name))
      throw new Error(
        `two stores are called ${holon.name}: at ${found.get(holon.name)!.folder} and ${folder}`,
      );

    found.set(holon.name, { folder, root });
  }

  return found;
}

// The stores this repository holds, found once for a process.
let here: Promise<ReadonlyMap<string, Found>> | undefined;
export const storesHere = () => (here ??= storesIn(import.meta.dir));

// Where a store's files are, by its name.
export async function storeFolder(name: string) {
  const found = (await storesHere()).get(name);
  if (!found) throw new Error(`no store here is called ${name}`);

  return found.folder;
}

// An engine on this machine over stores found beneath a folder, this repository's by
// default: every one mounted as itself, those named written through it.
export async function engineOver(
  found: ReadonlyMap<string, Found>,
  { writes = [] as readonly string[] } = {},
): Promise<Engine> {
  const started = await engine({ workers: sameThread(), count: 2 });
  for (const [name, { folder }] of found)
    await started.mount(name, open(folder), { write: writes.includes(name) });
  return started;
}

export const engineHere = async (as: { writes?: readonly string[] } = {}) =>
  engineOver(await storesHere(), as);

// Every holon a store holds now, its root and all it holds, as the author's tools read
// them.
export async function holonsOf(folder: string): Promise<Holon[]> {
  const { head, root } = await rootOf(folder);
  return linesOf(await open(folder).read(head, { whole: { id: root } })) as Holon[];
}

// The holons of the stores named, by store, each read as it stands now.
export async function holonsHere(...names: string[]): Promise<Record<string, Holon[]>> {
  return Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await holonsOf(await storeFolder(name))] as const)),
  );
}

// The types among holons, each id by the name it is asked by: the first of a name. Only
// names are in it, so a type called constructor is a type like any other.
export function typesOf(holons: Holon[]) {
  const types: Record<string, string> = Object.create(null);

  for (const holon of holons) {
    if (holon.mould && holon.name && !(holon.name in types)) types[holon.name] = holon.id;
  }

  return types;
}

// A type by its name, or a refusal that says which is missing.
export function typeNamed(types: Record<string, string>, name: string) {
  const id = types[name];
  if (!id) throw new Error(`there is no type ${name}`);
  return id;
}
