import { join } from "node:path";

// Builds the client into the site: the page, the chassis it loads, and the
// engine it starts on its own thread. The site is output only, never kept.

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
for (const output of built.outputs) console.log(output.path.slice(repo.length + 1));
