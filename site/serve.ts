import { join, normalize } from "node:path";
import { storeFolder, stores, type StoreName } from "../stores.ts";

// Serves the site as a static host would, on this machine only: the page and the
// client from what was built, and each store live from its own folder, so what is
// drawn is what the field holds now, not what it held when the site was built.

const site = join(import.meta.dir, "dist");
const port = Number(process.env.PORT ?? 4330);

// Where a path is kept: a store's files in its folder, anything else in what was built.
function fileOf(path: string) {
  const [, first, name, ...rest] = path.split("/");

  if (first === "stores" && name && name in stores)
    return Bun.file(join(storeFolder(name as StoreName), ...rest));

  return Bun.file(join(site, path.endsWith("/") ? `${path}index.html` : path));
}

Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(request) {
    const path = normalize(decodeURIComponent(new URL(request.url).pathname));
    const file = fileOf(path);
    if (!path.startsWith("/") || path.includes("..") || !(await file.exists()))
      return new Response("not here", { status: 404 });
    return new Response(file, {
      headers: { "access-control-allow-origin": "*", "cache-control": "no-cache" },
    });
  },
});
console.log(`glass at http://127.0.0.1:${port}/`);
