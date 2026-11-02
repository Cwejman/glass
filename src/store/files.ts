import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { canonical } from "./canonical.ts";
import { asRef, path, type Backend } from "./backend.ts";
import type { Name } from "./name.ts";
import type { Store } from "./store.ts";

// A store as a directory on disk: refs/main, objects/ab/cdef….json, and an
// optional bundle per commit.

export function fileBackend(dir: string): Backend {
  const ref = async (name: string) => {
    const text = await read(join(dir, "refs", name));
    return text === undefined ? undefined : asRef(text);
  };
  return {
    writable: true,
    get: (name) => read(join(dir, "objects", path(name))),
    async put(name, text) {
      const file = join(dir, "objects", path(name));
      if ((await read(file)) !== undefined) return;
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, text);
    },
    ref,
    // Written beside and renamed into place, so a ref is never half written.
    async moveRef(name, to, from) {
      const file = join(dir, "refs", name);
      if ((await ref(name)) !== from) return false;
      await mkdir(dirname(file), { recursive: true });
      await writeFile(`${file}.next`, `${to}\n`);
      await rename(`${file}.next`, file);
      return true;
    },
  };
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
