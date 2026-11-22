// Builds the site: the page, and each module it starts on a thread of its own, from
// site/ into one folder, sharing what they share as chunks beside them, so a thread
// running two of them runs each module they share once; the components' look and the
// faces it names, from interface/web/look/; and
// each store this repository holds, as the page reads it in strata: its history and its
// index, each head and every blob it reaches, gzipped, at strata/<name>/ and its index/
// within, which the browser unpacks. The stores are read as they stand, with nothing
// converted. What it writes, site/dist/, is output only.

import type { BunPlugin } from "bun";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { storesHere } from "../stores.ts";
import { blobsOf } from "../stores/strata/head.ts";
import { folderStorages } from "../stores/strata/storage/folder.ts";

const repo = join(import.meta.dir, "..");
const dist = join(import.meta.dir, "dist");

rmSync(dist, { recursive: true, force: true });

// The code names a module it starts by its source's URL; built, that URL names the file
// built for it.
const startedAs: Record<string, string> = {
  "site/page.ts": "page.js",
  "engine/browser.ts": "engine.js",
  "engine/worker.ts": "engine-worker.js",
  "stores/strata/browser.ts": "strata.js",
  "stores/buffer/browser.ts": "buffer.js",
  "runtime/worker.ts": "worker.js",
};

const startedByBuiltName: BunPlugin = {
  name: "modules started by their built names",
  setup(build) {
    build.onLoad({ filter: /\.tsx?$/ }, async ({ path, loader }) => {
      const text = await Bun.file(path).text();
      const contents = text.replace(
        /new URL\("(\.{1,2}\/[^"]+\.ts)", import\.meta\.url\)/g,
        (_whole, source: string) => {
          const built = startedAs[relative(repo, resolve(dirname(path), source))];
          if (!built) throw new Error(`${path} starts ${source}, which is not built for the page`);
          return `new URL("./${built}", import.meta.url)`;
        },
      );
      return { contents, loader };
    });
  },
};

const built = await Bun.build({
  entrypoints: Object.values(startedAs).map((name) => join(import.meta.dir, name.replace(".js", ".ts"))),
  outdir: dist,
  naming: { entry: "[name].[ext]", chunk: "chunk-[hash].[ext]" },
  splitting: true,
  format: "esm",
  target: "browser",
  plugins: [startedByBuiltName],
});
if (!built.success) throw new AggregateError(built.logs, "building the page");

// The components' look, shipped with them: one stylesheet, and the faces it names.
const look = join(repo, "interface/web/look");
const styled = await Bun.build({
  entrypoints: [join(look, "glass.css")],
  outdir: dist,
  naming: "[name].[ext]",
  external: ["*.woff2"],
});
if (!styled.success) throw new AggregateError(styled.logs, "building the look");
cpSync(join(look, "fonts"), join(dist, "fonts"), { recursive: true });

cpSync(join(import.meta.dir, "index.html"), join(dist, "index.html"));

// Each store as it stands in its folder. A store whose index is missing or behind, as one
// cloned from git, has it caught up from its history as it is found (stores.ts reads its
// root through strata).
for (const [name, { folder }] of await storesHere()) {
  const blobs = await blobsOf(folderStorages(folder));
  for (const [from, out, reached] of [
    [folder, join(dist, "strata", name), blobs.history],
    [join(folder, "index"), join(dist, "strata", name, "index"), blobs.index],
  ] as const) {
    mkdirSync(join(out, "blobs"), { recursive: true });
    writeFileSync(join(out, "head"), readFileSync(join(from, "head")));
    for (const blob of reached)
      writeFileSync(join(out, "blobs", blob), Bun.gzipSync(readFileSync(join(from, "blobs", blob))));
  }
}

for (const output of built.outputs) console.log(output.path.slice(repo.length + 1));
