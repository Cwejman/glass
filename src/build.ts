// Builds the client into the site: the page, the chassis it loads, the engine it
// starts on its own thread, and the stores as plain files. The site is output only.

import { cpSync, rmSync } from "node:fs";
import { join } from "node:path";

const repo = join(import.meta.dir, "..");

const built = await Bun.build({
  entrypoints: [join(repo, "src/interface/chassis.ts"), join(repo, "src/engine/worker.ts")],
  outdir: join(repo, "site"),
  naming: { entry: "[name].js" },
  format: "esm",
  target: "browser",
});

if (!built.success) throw new AggregateError(built.logs, "building the client");

await Bun.write(join(repo, "site/index.html"), Bun.file(join(repo, "src/site/index.html")));

rmSync(join(repo, "site/store"), { recursive: true, force: true });
cpSync(join(repo, "store"), join(repo, "site/store"), { recursive: true });

for (const output of built.outputs) console.log(output.path.slice(repo.length + 1));
