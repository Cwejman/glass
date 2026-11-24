// Builds the site: the page, and each module it starts on a thread of its own, each at
// its path within the repository, sharing what they share as chunks beside them, so a thread
// running two of them runs each module they share once; the components' look and the
// faces it names, from components/web/look/, the chassis's own from chassis/web/look/, and
// the page's inspector's from site/; and
// each store this repository holds, as the page reads it in strata: its history and its
// index, each head and every blob it reaches, gzipped, at strata/<name>/ and its index/
// within, which the browser unpacks. The stores are read as they stand, with nothing
// converted. What it writes, site/dist/, is output only.

import type { BunPlugin } from "bun";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { holonsHere, storesHere } from "../stores.ts";
import { blobsOf } from "../stores/strata/head.ts";
import { folderStorages } from "../stores/strata/storage/folder.ts";

const repo = join(import.meta.dir, "..");
const dist = join(import.meta.dir, "dist");

rmSync(dist, { recursive: true, force: true });

// The modules the page starts, each on a thread of its own, and the page itself: each
// built at its own path within the repository. A module started by its source's URL,
// new URL("./worker.ts", import.meta.url), is started built by its path from the site's
// root, /engine/worker.js, since the code naming it may be built into a shared chunk
// elsewhere; the site is served at the root of its origin.
const started = [
  "site/page.ts",
  "engine/browser.ts",
  "engine/worker.ts",
  "stores/strata/browser.ts",
  "integrations/location/browser.ts",
  "runtime/worker.ts",
];

const startedBuilt: BunPlugin = {
  name: "modules started by their built URLs",
  setup(build) {
    build.onLoad({ filter: /\.tsx?$/ }, async ({ path, loader }) => {
      const text = await Bun.file(path).text();
      const contents = text.replace(
        /new URL\("(\.{1,2}\/[^"]+)\.ts", import\.meta\.url\)/g,
        (_whole, source: string) => {
          const module = relative(repo, resolve(dirname(path), `${source}.ts`));
          if (!started.includes(module))
            throw new Error(`${path} starts ${source}.ts, which is not built for the page`);
          return `new URL("/${module.replace(/\.ts$/, ".js")}", import.meta.url)`;
        },
      );
      return { contents, loader };
    });
  },
};

// And each component's code on the web, as the field names it, in whichever store keeps
// the component, which the page loads by its path (page.ts).
const kept = await holonsHere(...(await storesHere()).keys());
const realized = Object.values(kept)
  .flatMap((holons) => holons)
  .flatMap(({ body }) => {
    const web = (body.realized as { web?: unknown } | undefined)?.web;
    return typeof web === "string" ? [web] : [];
  });

const built = await Bun.build({
  entrypoints: [...started, ...realized].map((source) => join(repo, source)),
  root: repo,
  outdir: dist,
  naming: { entry: "[dir]/[name].[ext]", chunk: "chunks/[hash].[ext]" },
  splitting: true,
  format: "esm",
  target: "browser",
  plugins: [startedBuilt],
});
if (!built.success) throw new AggregateError(built.logs, "building the page");

// The chassis's look, its tokens and what it makes itself, the components' look, shipped
// with them, and the inspector's: a stylesheet each, and the faces the components name.
const look = join(repo, "components/web/look");
const styled = await Bun.build({
  entrypoints: [
    join(repo, "chassis/web/look/chassis.css"),
    join(look, "glass.css"),
    join(import.meta.dir, "inspector.css"),
  ],
  outdir: dist,
  naming: "[name].[ext]",
  external: ["*.woff2"],
});
if (!styled.success) throw new AggregateError(styled.logs, "building the look");
cpSync(join(look, "fonts"), join(dist, "fonts"), { recursive: true });

// The page, and the page again as 404.html, which a static host such as GitHub's pages
// serves at every path it holds nothing at: so the page opens at any path of the site,
// a single-page app, its location taking every path (page.ts). Everything the page names
// it names from the site's root.
cpSync(join(import.meta.dir, "index.html"), join(dist, "index.html"));
cpSync(join(import.meta.dir, "index.html"), join(dist, "404.html"));

// Each store as it stands in its folder. A store whose index is missing or behind, as one
// cloned from git, has it caught up from its history as it is found (stores.ts reads its
// root through strata).
// A store may still be compacting its index as it is copied, moving its head to runs the
// blobs listed before do not reach; so a store is copied whole only when its heads read the
// same before and after, and copied again otherwise.
const headsOf = (folder: string) =>
  [folder, join(folder, "index")].map((at) => readFileSync(join(at, "head"), "utf8")).join("\n");

for (const [name, { folder }] of await storesHere()) {
  for (let tries = 1; ; tries++) {
    const before = headsOf(folder);
    try {
      const blobs = await blobsOf(folderStorages(folder));
      for (const [from, out, reached] of [
        [folder, join(dist, "strata", name), blobs.history],
        [join(folder, "index"), join(dist, "strata", name, "index"), blobs.index],
      ] as const) {
        rmSync(out, { recursive: true, force: true });
        mkdirSync(join(out, "blobs"), { recursive: true });
        writeFileSync(join(out, "head"), readFileSync(join(from, "head")));
        for (const blob of reached)
          writeFileSync(join(out, "blobs", blob), Bun.gzipSync(readFileSync(join(from, "blobs", blob))));
      }
      if (headsOf(folder) === before) break;
    } catch (problem) {
      if (tries >= 10) throw problem;
    }
    if (tries >= 10) throw new Error(`the store ${name} kept moving as it was copied`);
    await Bun.sleep(500);
  }

  // What is published must read: the history's head names a commit copied, and the index's
  // head names its commit and then its runs, one a line, each copied.
  const out = join(dist, "strata", name);
  const [latest] = readFileSync(join(out, "head"), "utf8").trim().split("\n");
  const [, ...runs] = readFileSync(join(out, "index", "head"), "utf8")
    .trim()
    .split("\n");
  for (const [at, blob] of [[out, latest!], ...runs.map((run) => [join(out, "index"), run.split(" ")[0]!])])
    if (!existsSync(join(at, "blobs", blob))) throw new Error(`the store ${name} was copied without ${blob}`);
}

for (const output of built.outputs) console.log(output.path.slice(repo.length + 1));
