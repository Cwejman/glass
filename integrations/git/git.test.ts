// The git reader over this repository itself: what it gives is what git says.

import { expect, test } from "bun:test";
import { join } from "node:path";
import { derivedOf } from "../glass/store.ts";
import { gitSource } from "./git.ts";

const repo = join(import.meta.dir, "../..");
const git = (...args: string[]) =>
  Bun.spawnSync(["git", "-C", repo, ...args])
    .stdout.toString()
    .trim();
const source = gitSource(repo, { depth: 3 });
const all = await source.all();
const named = (name: string) => [...all.values()].find(({ version }) => version.name === name)?.version;

test("HEAD names the commit git says, and the id leads back to its hash", async () => {
  const head = git("rev-parse", "HEAD");
  const ref = named("HEAD")!;
  const commitId = (ref.body.commit as { $ref: string }).$ref;

  expect(derivedOf(commitId)?.prefix).toBe(head.slice(0, 18));
  expect((await source.read(commitId))?.version.body.message).toBe(git("log", "-1", "--format=%B", "HEAD"));
});

test("the tip's tree says each name, and a blob only its size", async () => {
  const head = (await source.read((named("HEAD")!.body.commit as { $ref: string }).$ref))!.version;
  const tree = (await source.read((head.body.tree as { $ref: string }).$ref))!.version;
  const readme = (tree.body.entries as { name: string; entry: { $ref: string } }[]).find(
    ({ name }) => name === "README.md",
  )!;
  const blob = all.get(readme.entry.$ref)!.version;

  expect(blob.body.size).toBe(Number(git("cat-file", "-s", "HEAD:README.md")));
  expect(Object.keys(blob.body)).toEqual(["size"]);
});

test("the same object is the same id however often it is read", async () => {
  const again = await gitSource(repo, { depth: 3 }).all();
  expect([...again.keys()].sort()).toEqual([...all.keys()].sort());
});
