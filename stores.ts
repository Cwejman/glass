// The stores this repository holds, found where they lie: every folder keeping a .glass/
// is one, beside what it is about, and each is named by its own root, the one holon in it
// of the type store (the author's, 2026-11-10: a store is a field with one root, which
// says what it stands on, never where it is served). No file says which folder holds
// which store. The folder the search begins in comes first, the rest the nearer first,
// then by where they lie; what is built or installed is not searched.

import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { folderFiles } from "./integrations/glass/folder.ts";
import { asHolon, openStore, type Holon, type Store } from "./integrations/glass/store.ts";

export type { Holon, Store };

export const open = (folder: string) => openStore(folderFiles(folder));

const unsearched = new Set(["node_modules", "dist", ".git"]);

// Every .glass/ beneath a folder, the folder's own first.
function glassFolders(dir: string): string[] {
  const found: string[] = [];

  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".glass") found.push(join(at, entry.name));
      else if (!entry.name.startsWith(".") && !unsearched.has(entry.name)) walk(join(at, entry.name));
    }
  };
  walk(dir);

  const depth = (folder: string) => relative(dir, folder).split("/").length;
  return found.sort((x, y) => depth(x) - depth(y) || (x < y ? -1 : 1));
}

export type Found = { folder: string; store: Store };

// The stores beneath a folder, each by the name its root gives it.
export async function storesIn(dir: string): Promise<Map<string, Found>> {
  const opened = await Promise.all(
    glassFolders(dir).map(async (folder) => {
      const store = await open(folder);
      return { folder, store, holons: await holonsOf(store) };
    }),
  );

  const storeTypes = new Set(
    opened.flatMap(({ holons }) => holons.filter((h) => h.mould && h.name === "store").map((h) => h.id)),
  );

  const found = new Map<string, Found>();
  for (const { folder, store, holons } of opened) {
    const roots = holons.filter((h) => h.instance.some((type) => storeTypes.has(type)));
    if (roots.length !== 1) throw new Error(`the store at ${folder} has ${roots.length ? "more than one root" : "no root"}`);

    const name = roots[0]!.name;
    if (!name) throw new Error(`the root of the store at ${folder} has no name`);
    if (found.has(name)) throw new Error(`two stores are called ${name}: at ${found.get(name)!.folder} and ${folder}`);

    found.set(name, { folder, store });
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

// Every store, opened as it stands now, by its name.
export const openStores = async (): Promise<Record<string, Store>> =>
  Object.fromEntries(
    await Promise.all([...(await storesHere())].map(async ([name, { folder }]) => [name, await open(folder)] as const)),
  );

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

// Every holon a store holds, as the author's tools and the components' making read them.
export const holonsOf = async (store: Store) =>
  [...(await store.all()).values()].map(({ version }) => asHolon(version));
