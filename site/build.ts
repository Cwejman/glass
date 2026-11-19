// Builds the client into the site: the page, the chassis it loads, the engine it
// starts on its own thread, and each store as plain files, out of its dot folder so
// any static host serves it. Beside it, at next/, the page on the new engine, and the
// stores it reads in strata. What it writes, site/dist/, is output only.

import type { BunPlugin } from "bun";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { engine } from "../engine/next/engine.ts";
import { shipInterface } from "../engine/next/uses/interface.ts";
import { migrate } from "../engine/next/uses/migrate.ts";
import { sameThread } from "../runtime/runtime.ts";
import { storesHere } from "../stores.ts";
import type { Store } from "../stores/store.ts";
import { convert } from "../stores/strata/convert.ts";
import { blobsOf } from "../stores/strata/head.ts";
import { folderStorage } from "../stores/strata/storage/folder.ts";
import { strata } from "../stores/strata/strata.ts";

const repo = join(import.meta.dir, "..");
const dist = join(import.meta.dir, "dist");

// The site's store is made first, so what is shipped starts from what the field holds.
await import("./make.ts");

rmSync(dist, { recursive: true, force: true });

const built = await Bun.build({
  entrypoints: [join(repo, "interface/chassis.ts"), join(repo, "engine/serve/worker.ts")],
  outdir: dist,
  naming: { entry: "[name].js" },
  format: "esm",
  target: "browser",
});

if (!built.success) throw new AggregateError(built.logs, "building the client");

// The faces the material names, served beside the page.
cpSync(join(import.meta.dir, "fonts"), join(dist, "fonts"), { recursive: true });

for (const [name, { folder }] of await storesHere())
  cpSync(folder, join(dist, "stores", name), { recursive: true });

// The page on the new engine, and each module it starts on a thread of its own, built
// from site/next/ into one folder, sharing what they share as chunks beside them, so a
// thread running two of them runs each module they share once. The code names a module
// it starts by its source's URL; built, that URL names the file built for it.
const next = join(dist, "next");
const startedAs: Record<string, string> = {
  "site/next/page.ts": "page.js",
  "engine/next/browser.ts": "engine.js",
  "engine/next/worker.ts": "engine-worker.js",
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

const builtNext = await Bun.build({
  entrypoints: Object.values(startedAs).map((name) =>
    join(import.meta.dir, "next", name.replace(".js", ".ts")),
  ),
  outdir: next,
  naming: { entry: "[name].[ext]", chunk: "chunk-[hash].[ext]" },
  splitting: true,
  format: "esm",
  target: "browser",
  plugins: [startedByBuiltName],
});
if (!builtNext.success) throw new AggregateError(builtNext.logs, "building the page on the new engine");

cpSync(join(import.meta.dir, "next", "index.html"), join(next, "index.html"));

// Each store in strata, as the new engine reads it: converted, its expressions written
// again as uses, the interface shipped in glass, then its head and every blob the head reaches written gzipped to
// next/strata/<name>/, which the browser unpacks.
const converted = mkdtempSync(join(tmpdir(), "glass-strata-"));
try {
  const names = [...(await storesHere()).keys()];
  const stores = new Map<string, Store>();
  const migrating = await engine({ workers: sameThread(), count: 2 });

  for (const name of names) {
    await convert(name, join(converted, name));
    stores.set(name, strata(folderStorage(join(converted, name))));
    await migrating.mount(name, stores.get(name)!, { write: true });
  }
  await migrate(migrating, stores);
  await shipInterface(migrating, stores);
  for (const name of names) await migrating.unmount(name);

  for (const name of names) {
    const from = join(converted, name);
    const out = join(next, "strata", name);
    mkdirSync(join(out, "blobs"), { recursive: true });
    writeFileSync(join(out, "head"), readFileSync(join(from, "head")));
    for (const blob of await blobsOf(folderStorage(from)))
      writeFileSync(join(out, "blobs", blob), Bun.gzipSync(readFileSync(join(from, "blobs", blob))));
  }
} finally {
  rmSync(converted, { recursive: true, force: true });
}

// The page names the site's store, which says what else to attach and what to boot into.
const page = await Bun.file(join(import.meta.dir, "index.html")).text();
if (!page.includes('data-site=""')) throw new Error("site/index.html has no empty data-site to fill");

await Bun.write(join(dist, "index.html"), page.replace('data-site=""', 'data-site="site=./stores/site/"'));

for (const output of [...built.outputs, ...builtNext.outputs])
  console.log(output.path.slice(repo.length + 1));
