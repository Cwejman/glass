import { join, normalize } from "node:path";

// Serves the site as a static host would, on this machine only: the page,
// the client, and the store as plain files.

const site = join(import.meta.dir, "../site");
const port = Number(process.env.PORT ?? 4330);

Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(request) {
    const path = normalize(decodeURIComponent(new URL(request.url).pathname));
    const file = Bun.file(join(site, path.endsWith("/") ? `${path}index.html` : path));
    if (!path.startsWith("/") || path.includes("..") || !(await file.exists()))
      return new Response("not here", { status: 404 });
    return new Response(file, { headers: { "access-control-allow-origin": "*" } });
  },
});
console.log(`glass at http://127.0.0.1:${port}/`);
