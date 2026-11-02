import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Json } from "../store/canonical.ts";
import { FileBackend, writeBundle } from "../store/files.ts";
import { newId, type Id } from "../store/id.ts";
import type { Body } from "../store/objects.ts";
import { Store, type Holon } from "../store/store.ts";
import { Engine } from "../engine/engine.ts";
import { linkTargets, parseFile, resolve, rewriteLinks, walk, type Section, type WikiFile } from "./wiki.ts";

// Births glass's field into its store as one commit: the types, the
// components built from their code, the entry, and this wiki, each brief a
// holon. A holon keeps the id it was first born with, found by where it came
// from, so a birth after the files change is a change to the same holons.
// Everything is committed through an engine, so every holon is judged.

const repo = join(import.meta.dir, "../..");
const storeDir = join(repo, "site/store");

const store = new Store(new FileBackend(storeDir));
const born = new Map<string, Id>();
const head = await store.head();
if (head)
  for await (const [id, name] of store.entries(await store.index(head))) {
    const from = (await store.versionOf(id, name)).body.from;
    if (typeof from === "string") born.set(from, id);
  }
const idFor = (from: string) => {
  if (!born.has(from)) born.set(from, newId());
  return born.get(from)!;
};

const holons: Holon[] = [];
const names: Record<string, Id> = {};

// The types, the type of types first, an instance of itself.
const typeOf: Record<string, Id> = {};
for (const file of ["type.json", ...(await readdir(join(repo, "field/types"))).filter((f) => f !== "type.json")]) {
  const from = `field/types/${file}`;
  const key = file.replace(/\.json$/, "");
  typeOf[key] = idFor(from);
  names[key] = typeOf[key]!;
  const body = JSON.parse(await readFile(join(repo, from), "utf8")) as Body;
  holons.push({ id: typeOf[key]!, instance: [idFor("field/types/type.json")], body: { ...body, from } });
}

// The components, each built from its code into one module.
const declared = JSON.parse(await readFile(join(repo, "field/components.json"), "utf8")) as {
  file: string;
  title: string;
  says: string;
  takes: string[];
  draws: string[];
}[];
const componentOf: Record<string, Id> = {};
for (const component of declared) {
  const from = `field/components/${component.file}`;
  const built = await Bun.build({ entrypoints: [join(repo, from)], format: "esm", target: "browser" });
  if (!built.success) throw new AggregateError(built.logs, `building ${from}`);
  const id = idFor(from);
  componentOf[component.file] = id;
  holons.push({
    id,
    instance: [typeOf.component!],
    body: {
      title: component.title,
      says: component.says,
      takes: component.takes.map((type) => ({ $ref: typeOf[type]! })),
      draws: component.draws,
      code: await built.outputs[0]!.text(),
      source: await readFile(join(repo, from), "utf8"),
      from,
    },
  });
}

// The wiki: every file reached from its entry by a link, each section a brief.
const files = new Map<string, WikiFile>();
const waiting = ["README.md"];
while (waiting.length) {
  const path = waiting.pop()!;
  if (files.has(path)) continue;
  const file = parseFile(path, await readFile(join(repo, path), "utf8"));
  files.set(path, file);
  walk(file.root, (section) => {
    for (const target of linkTargets(section.prose)) {
      const to = resolve(path, target);
      if (to?.path.endsWith(".md") && !files.has(to.path)) waiting.push(to.path);
    }
  });
}

const sectionId = new Map<Section, Id>();
for (const file of files.values()) {
  sectionId.set(file.root, idFor(file.path));
  for (const [slug, section] of file.slugs) if (section !== file.root) sectionId.set(section, idFor(`${file.path}#${slug}`));
}

const unresolved: string[] = [];
for (const file of files.values())
  walk(file.root, (section) => {
    const prose = rewriteLinks(section.prose, (target) => {
      const to = resolve(file.path, target);
      if (!to || !to.path.endsWith(".md")) return undefined;
      const into = files.get(to.path);
      const at = into && (to.anchor ? into.slugs.get(to.anchor) : into.root);
      if (!at) {
        unresolved.push(`${file.path}: ${target}`);
        return undefined;
      }
      return `ref:${sectionId.get(at)!}`;
    });
    const body: Body = { title: section.title, prose };
    if (section.parts.length) body.parts = section.parts.map((part) => ({ $ref: sectionId.get(part)! }));
    if (section === file.root && file.status) body.status = file.status;
    body.from = section === file.root ? file.path : `${file.path}#${section.slug}`;
    holons.push({ id: sectionId.get(section)!, instance: [typeOf[file.kind]!], body });
  });
if (unresolved.length) throw new Error(`links that lead nowhere:\n  ${unresolved.join("\n  ")}`);
names.wiki = sectionId.get(files.get("README.md")!.root)!;

// The entry: the reader, reading the wiki.
names.entry = idFor("field/entry");
holons.push({
  id: names.entry,
  instance: [typeOf.layout!],
  body: {
    title: "Entry",
    mounts: [{ component: { $ref: componentOf["reader.ts"]! }, reads: { $ref: names.wiki } }] as unknown as Json,
    from: "field/entry",
  },
});

const engine = new Engine(store);
await engine.start();
const commit = await engine.commit({ holons, names });
const now = commit ?? head;
// One bundle, for the commit the ref names; older ones are only a
// convenience made from objects that stay.
if (now) {
  await writeBundle(store, storeDir, now);
  for (const file of await readdir(join(storeDir, "bundles")))
    if (file !== `${now}.json`) await rm(join(storeDir, "bundles", file));
}

let changed = 0;
if (commit)
  for (const holon of holons) {
    const before = head ? await store.version(holon.id, head) : undefined;
    if ((await store.version(holon.id, commit))?.[0] !== before?.[0]) changed++;
  }
console.log(
  commit
    ? `born ${commit}: ${holons.length} holons from ${files.size} files, ${changed} new or changed`
    : `nothing changed; the store stands at ${head}`,
);
