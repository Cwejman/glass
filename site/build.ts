// Builds the client into the site: the page, the chassis it loads, the engine it
// starts on its own thread, and each store as plain files, out of its dot folder so
// any static host serves it. What it writes, site/dist/, is output only.

import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { storeFolder, stores, type StoreName } from "../stores.ts";

const repo = join(import.meta.dir, "..");
const dist = join(import.meta.dir, "dist");

rmSync(dist, { recursive: true, force: true });

const built = await Bun.build({
  entrypoints: [join(repo, "interface/chassis.ts"), join(repo, "engine/worker.ts")],
  outdir: dist,
  naming: { entry: "[name].js" },
  format: "esm",
  target: "browser",
});

if (!built.success) throw new AggregateError(built.logs, "building the client");

const names = Object.keys(stores) as StoreName[];

for (const name of names) cpSync(storeFolder(name), join(dist, "stores", name), { recursive: true });

// The page names every store it ships, each at the address it is copied to.
const page = await Bun.file(join(import.meta.dir, "index.html")).text();
if (!page.includes('data-stores=""')) throw new Error("site/index.html has no empty data-stores to fill");
const named = names.map((name) => `${name}=./stores/${name}/`).join(" ");

await Bun.write(join(dist, "index.html"), page.replace('data-stores=""', `data-stores="${named}"`));

for (const output of built.outputs) console.log(output.path.slice(repo.length + 1));
