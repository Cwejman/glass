// The stores on this machine: folders under the repository's store/, read through
// the same store code every other host of them uses.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Files } from "../store/files.ts";
import { openStore, type Holon, type Store } from "../store/store.ts";

export type { Holon, Store };

export const storeDir = join(import.meta.dir, "../../store");

export function folderFiles(dir: string): Files {
  const at = (path: string) => {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    return full;
  };

  return {
    read: async (path) =>
      existsSync(join(dir, path)) ? new Uint8Array(readFileSync(join(dir, path))) : null,
    write: async (path, content) => writeFileSync(at(path), content),
    append: async (path, text) => appendFileSync(at(path), text),
  };
}

export const open = (dir: string) => openStore(folderFiles(dir));

// Every holon a store holds, as the tools read them.
export const holonsOf = async (store: Store) =>
  [...(await store.all()).values()].map(({ version: { prev: _, ...holon } }) => holon as Holon);

// The stores under store/: the main one, and each folder beside its files with a ref of its own.
export function storeFolders() {
  const folders: Record<string, string> = { main: storeDir };

  for (const file of [...new Bun.Glob("*/refs/main").scanSync(storeDir)].sort()) {
    const name = file.split("/")[0]!;
    folders[name] = join(storeDir, name);
  }

  return folders;
}

// The field: every store under store/ read as one.
export async function field() {
  const all = new Map<string, Holon>();

  for (const dir of Object.values(storeFolders())) {
    for (const holon of await holonsOf(await open(dir))) all.set(holon.id, holon);
  }

  return all;
}
