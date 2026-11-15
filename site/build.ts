// Builds the client into the site: the page, the chassis it loads, the engine it
// starts on its own thread, and each store as plain files, out of its dot folder so
// any static host serves it. What it writes, site/dist/, is output only.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storesHere } from "../stores.ts";
import { convert } from "../stores/strata/convert.ts";
import { blobsOf } from "../stores/strata/head.ts";
import { folderStorage } from "../stores/strata/storage/folder.ts";

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

// Each store again in strata, for the engine to come: converted, then its head and every
// blob the head reaches written gzipped to strata/<name>/, which the browser unpacks.
for (const name of (await storesHere()).keys()) {
  const into = mkdtempSync(join(tmpdir(), `glass-${name}-`));
  try {
    await convert(name, into);
    const out = join(dist, "strata", name);
    mkdirSync(join(out, "blobs"), { recursive: true });
    writeFileSync(join(out, "head"), readFileSync(join(into, "head")));
    for (const blob of await blobsOf(folderStorage(into)))
      writeFileSync(join(out, "blobs", blob), Bun.gzipSync(readFileSync(join(into, "blobs", blob))));
  } finally {
    rmSync(into, { recursive: true, force: true });
  }
}

// The page names the site's store, which says what else to attach and what to boot into.
const page = await Bun.file(join(import.meta.dir, "index.html")).text();
if (!page.includes('data-site=""')) throw new Error("site/index.html has no empty data-site to fill");

await Bun.write(join(dist, "index.html"), page.replace('data-site=""', 'data-site="site=./stores/site/"'));

for (const output of built.outputs) console.log(output.path.slice(repo.length + 1));
