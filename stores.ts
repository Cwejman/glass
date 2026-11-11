// The stores this repository holds, each by the name it is asked by and the module
// whose .glass keeps it. Which folder holds which store is said here once, until each
// store's root names it.

import { join } from "node:path";
import { folderFiles } from "./integrations/glass/folder.ts";
import { asHolon, openStore, type Holon, type Store } from "./integrations/glass/store.ts";

export type { Holon, Store };

export const stores = {
  main: ".",
  glass: "components",
  paper: "author/paper",
  "paper-readings": "author/paper-readings",
  site: "site",
} as const;

export type StoreName = keyof typeof stores;

const folderOf = (module: string) => join(import.meta.dir, module, ".glass");

// Where a store's files are.
export const storeFolder = (name: StoreName) => folderOf(stores[name]);

export const open = (folder: string) => openStore(folderFiles(folder));

// Every store, opened, by its name.
export const openStores = async () =>
  Object.fromEntries(
    await Promise.all(
      Object.entries(stores).map(async ([name, module]) => [name, await open(folderOf(module))] as const),
    ),
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
