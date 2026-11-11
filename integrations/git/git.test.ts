// The git reader over this repository itself: what it gives is what git says.

import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { derivedId, derivedOf } from "../glass/store.ts";
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

// A folder of the test's own, made for it and taken away after it.
const made: string[] = [];
afterEach(() => made.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function folderOf(making: (dir: string) => void = () => undefined) {
  const dir = mkdtempSync(join(tmpdir(), "glass-git-"));
  made.push(dir);
  making(dir);
  return dir;
}

const run = (dir: string, ...args: string[]) => Bun.spawnSync(["git", "-C", dir, ...args]);

test("a folder that is no repository is refused in words, not read as an empty one", async () => {
  await expect(gitSource(folderOf()).all()).rejects.toThrow(/is no git repository/);
});

test("a repository with no commit yet gives its types and nothing else", async () => {
  const dir = folderOf((at) => run(at, "init", "-q"));
  const types = [...(await gitSource(dir).all()).values()].map(({ version }) => version.name);

  expect(types.sort()).toEqual(["blob", "commit", "ref", "tree"]);
});

test("an annotated tag names the commit it peels to, and its own object is no holon", async () => {
  const dir = folderOf((at) => {
    run(at, "init", "-q");
    run(at, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "one");
    run(at, "-c", "user.name=t", "-c", "user.email=t@t", "tag", "-a", "v1", "-m", "the first");
  });
  const source = gitSource(dir);
  const all = [...(await source.all()).values()].map(({ version }) => version);
  const commitOf = (name: string) =>
    (all.find((version) => version.name === name)!.body.commit as { $ref: string }).$ref;
  const tagObject = run(dir, "rev-parse", "v1").stdout.toString().trim();

  expect(commitOf("refs/tags/v1")).toBe(commitOf("HEAD"));
  expect(await source.read(derivedId(0, tagObject))).toBeNull();
});
