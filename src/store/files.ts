import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { canonical } from "./canonical.ts";
import { path, type Backend } from "./backend.ts";
import type { Name } from "./name.ts";
import type { Store } from "./store.ts";

// A store as a directory on disk: refs/main, objects/ab/cdef….json, and an
// optional bundle per commit.

export class FileBackend implements Backend {
  readonly writable = true;
  constructor(readonly dir: string) {}

  async get(name: Name) {
    return read(join(this.dir, "objects", path(name)));
  }
  async put(name: Name, text: string) {
    const file = join(this.dir, "objects", path(name));
    if ((await read(file)) !== undefined) return;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  async ref(ref: string) {
    return (await read(join(this.dir, "refs", ref)))?.trim() as Name | undefined;
  }
  async moveRef(ref: string, to: Name, from: Name | undefined) {
    const file = join(this.dir, "refs", ref);
    if ((await this.ref(ref)) !== from) return false;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file + ".next", to + "\n");
    await rename(file + ".next", file);
    return true;
  }
}

// Everything one commit reaches, in one file, for a first visit.
export async function writeBundle(store: Store, dir: string, commit: Name) {
  const objects = await store.reach(commit);
  const file = join(dir, "bundles", `${commit}.json`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, canonical({ kind: "bundle", commit, objects: Object.fromEntries(objects) }));
}

async function read(file: string) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
