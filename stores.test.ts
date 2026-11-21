// The stores a folder holds are found where they lie: every folder keeping a .glass/ with
// a strata store's history is one, named by its own root, the holon its latest commit is
// owned by. No file says which folder holds which store.

import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentOf, hashOf, partOf } from "./stores/act.ts";
import type { Act, Holon } from "./stores/store.ts";
import { folderStorages } from "./stores/strata/storage/folder.ts";
import { strata } from "./stores/strata/strata.ts";
import { engineOver, holonsOf, storesIn } from "./stores.ts";

const made: string[] = [];
afterEach(() => made.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const here = () => {
  const dir = mkdtempSync(join(tmpdir(), "stores-"));
  made.push(dir);
  return dir;
};

let minted = 0;
const id = () => `1M75HB35AC7${String(++minted).padStart(4, "0")}`;

// A store in a folder: one commit, owned by its root, named as given, or by an id no
// holon of it has, to have none; the holons given beside it.
async function storeAt(folder: string, name: string | null, beside: Holon[] = []) {
  const root: Holon = { id: id(), instance: [], ...(name !== null && { name }), body: { contents: [] } };
  const holons = name === null ? beside : [root, ...beside];
  const part = partOf(holons);
  const said = {
    when: "2026-11-21T00:00:00.000Z",
    says: "a store",
    at: [],
    gone: [],
    parts: [[root.id, part && (await hashOf(part))]] as Act["parts"],
  };
  mkdirSync(folder, { recursive: true });
  const reply = await strata(folderStorages(join(folder, ".glass"))).offer({
    ...said,
    hash: await hashOf(contentOf(said)),
    own: root.id,
    holons,
    born: holons.map(({ id }) => id),
    over: null,
    touches: { ids: holons.map(({ id }) => id), addresses: [] },
  });
  if (!("accepted" in reply)) throw new Error(JSON.stringify(reply));
  return root;
}

test("every folder keeping a .glass/ is a store, named by its root", async () => {
  const dir = here();
  await storeAt(dir, "glass");
  await storeAt(join(dir, "author", "paper"), "paper");
  await storeAt(join(dir, "wiki"), "wiki");

  const found = await storesIn(dir);

  expect([...found.keys()]).toEqual(["glass", "wiki", "paper"]);
  expect(found.get("paper")!.folder).toBe(join(dir, "author", "paper", ".glass"));
});

test("the folder the search begins in comes first, the rest the nearer first, then by where they lie", async () => {
  const dir = here();
  await storeAt(join(dir, "b"), "b first by path");
  await storeAt(dir, "the root's");
  await storeAt(join(dir, "a"), "a");

  expect([...(await storesIn(dir)).keys()]).toEqual(["the root's", "a", "b first by path"]);
});

test("a store whose root is not in it, or has no name, or two stores of one name, is refused", async () => {
  const none = here();
  await storeAt(none, null, [{ id: id(), instance: [], name: "loose", body: {} }]);
  expect(storesIn(none)).rejects.toThrow("does not hold its root");

  const nameless = here();
  await storeAt(nameless, null, []);
  expect(storesIn(nameless)).rejects.toThrow();

  const twice = here();
  await storeAt(twice, "same");
  await storeAt(join(twice, "other"), "same");
  expect(storesIn(twice)).rejects.toThrow("two stores are called same");
});

test("what is built or installed is not searched, nor a .glass/ keeping no history", async () => {
  const dir = here();
  await storeAt(dir, "glass");
  await storeAt(join(dir, "node_modules", "x"), "installed");
  await storeAt(join(dir, "site", "dist", "y"), "built");
  mkdirSync(join(dir, "earlier", ".glass", "log"), { recursive: true });

  expect([...(await storesIn(dir)).keys()]).toEqual(["glass"]);
});

test("a store's holons are its root and all it holds, and the engine here mounts each by its name", async () => {
  const dir = here();
  const note: Holon = { id: id(), instance: [], name: "note", body: {} };
  const root = await storeAt(dir, "notes", [note]);

  const found = await storesIn(dir);
  expect((await holonsOf(found.get("notes")!.folder)).map(({ id }) => id).sort()).toEqual([root.id].sort());

  const engine = await engineOver(found);
  const answer = await engine.read({ gives: { $ref: note.id } });
  expect(answer).toMatchObject({ value: { $ref: note.id } });
});
