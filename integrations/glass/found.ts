// The stores of the earlier format, blocks and a log in .glass/, as the earlier engine
// reads them. The stores of record are strata now (stores.ts); the earlier format is
// kept only in git's history, and is read from there, as the stores stood at the commit
// before the swap, by the earlier engine and what is cut from it, until they are removed.
// Every folder keeping a .glass/ with a log is one, named by its own root.

import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { isRoot } from "../../engine/moulds.ts";
import { folderFiles } from "./folder.ts";
import { asHolon, openStore, type Holon, type Store } from "./store.ts";

export type { Holon, Store };

// The last commit that kept the stores of record in the earlier format.
export const lastKept = "679561c";

const repo = join(import.meta.dir, "..", "..");
const folders = [
  ".glass",
  "components/.glass",
  "site/.glass",
  "author/paper/.glass",
  "author/paper-readings/.glass",
];

export const open = (folder: string) => openStore(folderFiles(folder));

const unsearched = new Set(["node_modules", "dist", ".git"]);

// Every .glass/ of the earlier format beneath a folder, the folder's own first.
function glassFolders(dir: string): string[] {
  const found: string[] = [];

  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === ".glass") {
        if (existsSync(join(at, entry.name, "log"))) found.push(join(at, entry.name));
      } else if (!entry.name.startsWith(".") && !unsearched.has(entry.name)) walk(join(at, entry.name));
    }
  };
  walk(dir);

  const depth = (folder: string) => relative(dir, folder).split("/").length;
  return found.sort((x, y) => depth(x) - depth(y) || (x < y ? -1 : 1));
}

export type Found = { folder: string; store: Store };

// The stores of the earlier format beneath a folder, each by the name its root gives it.
export async function storesIn(dir: string): Promise<Map<string, Found>> {
  const opened = await Promise.all(
    glassFolders(dir).map(async (folder) => {
      const store = await open(folder);
      return { folder, store, holons: await holonsOf(store) };
    }),
  );

  const everywhere = new Map(
    opened.flatMap(({ holons }) => holons.map((holon) => [holon.id, holon] as const)),
  );

  const found = new Map<string, Found>();
  for (const { folder, store, holons } of opened) {
    const roots = holons.filter((holon) => isRoot(holon, (id) => everywhere.get(id)));
    if (roots.length !== 1)
      throw new Error(`the store at ${folder} has ${roots.length ? "more than one root" : "no root"}`);

    const name = roots[0]!.name;
    if (!name) throw new Error(`the root of the store at ${folder} has no name`);
    if (found.has(name))
      throw new Error(`two stores are called ${name}: at ${found.get(name)!.folder} and ${folder}`);

    found.set(name, { folder, store });
  }

  return found;
}

// The stores of record as they stood at lastKept, taken out of git into a folder of this
// process's own, removed as it exits, so nothing read here is written back.
let kept: Promise<ReadonlyMap<string, Found>> | undefined;
export function storesKept() {
  kept ??= (async () => {
    const dir = mkdtempSync(join(tmpdir(), "glass-earlier-"));
    process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
    execSync(`git archive ${lastKept} ${folders.join(" ")} | tar -x -C ${JSON.stringify(dir)}`, {
      cwd: repo,
    });
    return storesIn(dir);
  })();
  return kept;
}

// Every store kept, opened as it stood, by its name.
export const openStores = async (): Promise<Record<string, Store>> =>
  Object.fromEntries([...(await storesKept())].map(([name, { store }]) => [name, store] as const));

// Every holon a store holds.
export const holonsOf = async (store: Store) =>
  [...(await store.all()).values()].map(({ version }) => asHolon(version));
