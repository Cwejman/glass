import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileBackend, writeBundle } from "../store/files.ts";
import { newId, type Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { Body } from "../store/objects.ts";
import { openStore } from "../store/store.ts";
import { startEngine } from "../engine/engine.ts";
import {
  components,
  entry,
  kinds,
  materials,
  types,
  wiki,
  type Born,
  type ComponentFile,
  type KindFile,
  type TypeFile,
} from "./holons.ts";
import { flatten, linkTargets, parseFile, resolve, type WikiFile } from "./wiki.ts";

// Births glass's field into its store as one commit: the types, the
// materials, the components built from their code, this wiki, and the entry
// that reads it. A holon keeps
// the id it was first born with, found by where it came from, its file and
// its heading's anchor, so a birth after the files change is a change to the
// same holons; a heading renamed is a new holon, and what the files no longer
// hold is taken out of the field. Everything is committed through an engine,
// so every holon is judged. This is the edge: it reads the files, builds the
// code and writes the store, and what the field is made of is `holons.ts`.

const repo = join(import.meta.dir, "../..");
const storeDir = join(repo, "site/store");
const store = openStore(fileBackend(storeDir));
const head = await store.head();

const born = new Map<string, Id>();
if (head)
  for await (const [id, name] of store.entries(await store.index(head))) {
    const from = (await store.versionOf(id, name)).body.from;
    if (typeof from === "string") born.set(from, id);
  }
const before = new Set(born.values());
const idOf = (from: string) => {
  if (!born.has(from)) born.set(from, newId());
  return born.get(from)!;
};

const typeFiles: TypeFile[] = await Promise.all(
  (await readdir(join(repo, "field/types"))).sort().map(async (file) => ({
    from: `field/types/${file}`,
    name: file.replace(/\.json$/, ""),
    body: JSON.parse(await readFile(join(repo, "field/types", file), "utf8")) as Body,
  })),
);
const bornTypes = types(typeFiles, idOf, "field/types/type.json");

const declared = JSON.parse(await readFile(join(repo, "field/components.json"), "utf8")) as (Omit<
  ComponentFile,
  "from" | "code" | "source"
> & {
  file: string;
})[];
const componentFiles: ComponentFile[] = await Promise.all(
  declared.map(async ({ file, ...component }) => {
    const from = `field/components/${file}`;
    const built = await Bun.build({ entrypoints: [join(repo, from)], format: "esm", target: "browser" });
    if (!built.success) throw new AggregateError(built.logs, `building ${from}`);
    return {
      ...component,
      from,
      code: await built.outputs[0]!.text(),
      source: await readFile(join(repo, from), "utf8"),
    };
  }),
);
const kindFiles = JSON.parse(await readFile(join(repo, "field/kinds.json"), "utf8")) as KindFile[];
const bornKinds = kinds(kindFiles, idOf, bornTypes.names);
const bornComponents = components(componentFiles, idOf, bornTypes.names, bornKinds.names);

const declaredMaterials = JSON.parse(await readFile(join(repo, "field/materials.json"), "utf8")) as {
  file: string;
  title: string;
  says: string;
}[];
const bornMaterials = materials(
  await Promise.all(
    declaredMaterials.map(async ({ file, title, says }) => ({
      from: `field/materials/${file}`,
      title,
      says,
      css: await readFile(join(repo, "field/materials", file), "utf8"),
    })),
  ),
  idOf,
  bornTypes.names,
);

const files = await readWiki("README.md");
const bornWiki = wiki(files, "README.md", idOf, bornTypes.names);
const bornEntry = entry(idOf, bornTypes.names);

const field: Born[] = [bornTypes, bornKinds, bornMaterials, bornComponents, bornWiki, bornEntry];
const holons = field.flatMap(({ holons }) => holons);
const names = Object.assign({}, ...field.map(({ names }) => names));
const gone = [...before].filter((id) => !holons.some((holon) => holon.id === id));

const engine = await startEngine(store);
const commit = await engine.commit({ holons, names, gone });

// One bundle, for the commit the ref names; older ones are only a
// convenience made from objects that stay.
const now = commit ?? head;
if (now) {
  await writeBundle(store, storeDir, now);
  for (const file of await readdir(join(storeDir, "bundles")))
    if (file !== `${now}.json`) await rm(join(storeDir, "bundles", file));
}

// How many holons the commit gave a version they did not have before.
const versionAt = async (id: Id, at: Name | undefined) => at && (await store.version(id, at))?.[0];
const changed = commit
  ? (
      await Promise.all(
        holons.map(async ({ id }) => (await versionAt(id, commit)) !== (await versionAt(id, head))),
      )
    ).filter(Boolean).length
  : 0;

console.log(
  commit
    ? `born ${commit}: ${holons.length} holons from ${files.size} files, ${changed} new or changed, ${gone.length} gone`
    : `nothing changed; the store stands at ${head}`,
);

// Every file the entry reaches by a link, each parsed under the rule.
async function readWiki(entryPath: string) {
  const files = new Map<string, WikiFile>();
  const waiting = [entryPath];
  while (waiting.length) {
    const path = waiting.pop()!;
    if (files.has(path)) continue;
    const file = parseFile(path, await readFile(join(repo, path), "utf8"));
    files.set(path, file);
    const linked = flatten(file.root).flatMap((section) =>
      linkTargets(section.prose).map((target) => resolve(path, target)?.path),
    );
    waiting.push(...linked.filter((to): to is string => !!to?.endsWith(".md") && !files.has(to)));
  }
  return files;
}
