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

// A repository of the test's own with one commit, git said as the test's own author.
function repoWith(making: (at: string, as: (...args: string[]) => void) => void) {
  return folderOf((at) => {
    const as = (...args: string[]) => void run(at, "-c", "user.name=t", "-c", "user.email=t@t", ...args);
    run(at, "init", "-q");
    as("commit", "-q", "--allow-empty", "-m", "one");
    making(at, as);
  });
}

test("a tag of a tag names the commit beneath them both", async () => {
  const dir = repoWith((_, as) => {
    as("tag", "-a", "inner", "-m", "inner");
    as("tag", "-a", "outer", "inner", "-m", "outer");
  });
  const all = [...(await gitSource(dir).all()).values()].map(({ version }) => version);
  const named = (name: string) => all.find((version) => version.name === name)!.body;

  expect(named("refs/tags/outer").commit).toEqual(named("HEAD").commit);
});

test("a ref naming what is no commit says what it names, and names no commit", async () => {
  const dir = repoWith((_, as) => as("tag", "tree-tag", "HEAD^{tree}"));
  const all = [...(await gitSource(dir).all()).values()].map(({ version }) => version);
  const tag = all.find((version) => version.name === "refs/tags/tree-tag")!;
  const tree = run(dir, "rev-parse", "HEAD^{tree}").stdout.toString().trim();

  expect(tag.body.commit).toBeUndefined();
  expect(tag.body.names).toEqual({ $ref: derivedId(0, tree) });
});

test("a submodule's entry points at a commit that is not here, and holds nothing", async () => {
  const elsewhere = "0123456789abcdef0123456789abcdef01234567";
  const dir = repoWith((at, as) => {
    run(at, "update-index", "--add", "--cacheinfo", `160000,${elsewhere},vendored`);
    as("commit", "-q", "-m", "a submodule");
  });
  const source = gitSource(dir);
  const all = [...(await source.all()).values()].map(({ version }) => version);
  const head = all.find((version) => version.name === "HEAD")!;
  const commit = (await source.read((head.body.commit as { $ref: string }).$ref))!.version;
  const tree = (await source.read((commit.body.tree as { $ref: string }).$ref))!.version;
  const entry = (tree.body.entries as { name: string; entry: { $ref: string; $holds: boolean } }[]).find(
    ({ name }) => name === "vendored",
  )!;

  expect(entry.entry).toEqual({ $ref: derivedId(0, elsewhere), $holds: false });
  expect(all.find((version) => version.id === derivedId(0, elsewhere))).toBeUndefined();
});

test("what everything gives, the trees are said as reading each tree gives them", async () => {
  const dir = repoWith((at, as) => {
    Bun.spawnSync([
      "sh",
      "-c",
      `mkdir -p ${at}/a/b && echo one > ${at}/a/b/one.txt && echo two > ${at}/two.txt`,
    ]);
    run(at, "add", ".");
    as("commit", "-q", "-m", "files");
  });
  const source = gitSource(dir);
  const all = await source.all();

  for (const [id, { version }] of all) {
    if (!version.body.entries) continue;
    expect((await source.read(id))!.version.body).toEqual(version.body);
  }
});

test("many objects read at once each come back as themselves", async () => {
  const source = gitSource(repo, { depth: 3 });
  const ids = [...all.keys()].filter((id) => derivedOf(id)?.facet === 0).slice(0, 40);
  const together = await Promise.all(ids.map((id) => source.read(id)));

  expect(together.map((latest) => latest?.version.id)).toEqual(ids);
});

test("an object asked of a folder that is no repository is refused in words", async () => {
  await expect(
    gitSource(folderOf()).read(derivedId(0, "0123456789abcdef0123456789abcdef01234567")),
  ).rejects.toThrow(/no git repository/);
});

test("a read nobody awaits still comes back before the process ends", () => {
  const blob = run(repo, "rev-parse", "HEAD:README.md").stdout.toString().trim();
  const script = `import { gitSource } from "${join(import.meta.dir, "git.ts")}";
import { derivedId } from "${join(import.meta.dir, "../glass/store.ts")}";
gitSource("${repo}").read(derivedId(0, "${blob}")).then((latest) => console.log(latest.version.body.size));`;
  const said = Bun.spawnSync(["bun", "-e", script], { timeout: 20000 }).stdout.toString().trim();

  expect(Number(said)).toBe(Number(run(repo, "cat-file", "-s", blob).stdout.toString()));
});

test("a large blob is known by its size without its bytes held", async () => {
  const dir = repoWith((at, as) => {
    Bun.spawnSync(["sh", "-c", `head -c 40000000 /dev/zero > ${at}/large.bin`]);
    run(at, "add", ".");
    as("commit", "-q", "-m", "large");
  });
  const blob = run(dir, "rev-parse", "HEAD:large.bin").stdout.toString().trim();

  const started = performance.now();
  const latest = await gitSource(dir).read(derivedId(0, blob));

  expect(latest!.version.body.size).toBe(40000000);
  expect(performance.now() - started).toBeLessThan(3000);
});

test("a HEAD naming a tag is peeled to its commit, and the tip's tree is read", async () => {
  const dir = repoWith((at, as) => {
    as("tag", "-a", "v1", "-m", "v1");
    const branch = run(at, "symbolic-ref", "HEAD").stdout.toString().trim();
    run(at, "update-ref", "--no-deref", branch, run(at, "rev-parse", "v1").stdout.toString().trim());
  });
  const all = [...(await gitSource(dir).all()).values()].map(({ version }) => version);
  const head = all.find((version) => version.name === "HEAD")!;
  const commit = run(dir, "rev-parse", "v1^{commit}").stdout.toString().trim();

  expect(head.body.commit).toEqual({ $ref: derivedId(0, commit) });
  expect(all.some((version) => version.body.entries)).toBe(true);
});
