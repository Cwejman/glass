// The stores a folder holds are found where they lie: every folder keeping a .glass/ is
// one, named by its own root, the one holon in it of the type store. No file says which
// folder holds which store.

import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { folderFiles } from "./integrations/glass/folder.ts";
import { commit, openStore } from "./integrations/glass/store.ts";
import { storesIn } from "./stores.ts";

const made: string[] = [];
afterEach(() => made.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const here = () => {
  const dir = mkdtempSync(join(tmpdir(), "stores-"));
  made.push(dir);
  return dir;
};

// A store in a folder: the type store in it where it is the first, and a root of that
// type named as given, unless it is to have none.
async function storeAt(folder: string, name: string | null, storeType?: string) {
  mkdirSync(folder, { recursive: true });
  const store = await openStore(folderFiles(join(folder, ".glass")));
  const mint = store.minter();
  const type = storeType ?? mint();
  const holons = [
    ...(storeType ? [] : [{ id: type, instance: [], name: "store", mould: { contents: { says: "Its top.", shape: { list: "ref" }, holds: true } }, body: {} }]),
    ...(name === null ? [] : [{ id: mint(), instance: [type], name, body: { contents: [] } }]),
  ];
  await commit(store, { says: "a store", holons });
  return type;
}

test("every folder keeping a .glass/ is a store, named by its root", async () => {
  const dir = here();
  const type = await storeAt(dir, "main");
  await storeAt(join(dir, "author", "paper"), "paper", type);
  await storeAt(join(dir, "components"), "glass", type);

  const found = await storesIn(dir);

  expect([...found.keys()]).toEqual(["main", "glass", "paper"]);
  expect(found.get("paper")!.folder).toBe(join(dir, "author", "paper", ".glass"));
});

test("the folder the search begins in comes first, the rest the nearer first, then by where they lie", async () => {
  const dir = here();
  const type = await storeAt(join(dir, "b"), "b first by path");
  await storeAt(dir, "the root's", type);
  await storeAt(join(dir, "a"), "a", type);

  expect([...(await storesIn(dir)).keys()]).toEqual(["the root's", "a", "b first by path"]);
});

test("a store with no root, or two stores of one name, is refused", async () => {
  const none = here();
  await storeAt(none, null);
  expect(storesIn(none)).rejects.toThrow("has no root");

  const twice = here();
  const type = await storeAt(twice, "same");
  await storeAt(join(twice, "other"), "same", type);
  expect(storesIn(twice)).rejects.toThrow("two stores are called same");
});

test("what is built or installed is not searched", async () => {
  const dir = here();
  const type = await storeAt(dir, "main");
  await storeAt(join(dir, "node_modules", "x"), "installed", type);
  await storeAt(join(dir, "site", "dist", "y"), "built", type);

  expect([...(await storesIn(dir)).keys()]).toEqual(["main"]);
});
