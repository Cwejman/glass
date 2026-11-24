// The host on this machine: it serves the built site, as a static host would, its
// 404.html at any path holding nothing, and each
// store live from its folder at strata/<name>/, as the build lays it out, so a page
// opened after a commit reads the store as it stands, whoever wrote it. Its history's
// head and blobs, and its index's within at index/; a blob, named by its hash and never
// changed, gzipped as the build writes it, a head read fresh each time. The page starts
// its own engine over what it is served, so the host runs none.

import { join, normalize } from "node:path";

type Hosting = {
  port: number;
  // Each store by the name it is served by, and the folder that keeps it.
  stores: Record<string, string>;
  site: string;
};

const blobName = /^[0-9a-f]{64}$/;

export function host({ port, stores, site }: Hosting) {
  const headers = { "access-control-allow-origin": "*", "cache-control": "no-cache" };

  // A store's file as the page asks for it: a head, or a blob, gzipped; none else.
  async function storeFile(folder: string, rest: string[]): Promise<Response | null> {
    const [first, second, third] = rest;
    const within = first === "index" ? join(folder, "index") : folder;
    const [kind, name] = first === "index" ? [second, third] : [first, second];
    const more = first === "index" ? rest.length > 3 : rest.length > 2;
    if (more) return null;

    if (kind === "head" && name === undefined) {
      const file = Bun.file(join(within, "head"));
      return (await file.exists()) ? new Response(file, { headers }) : null;
    }
    if (kind === "blobs" && name && blobName.test(name)) {
      const file = Bun.file(join(within, "blobs", name));
      if (!(await file.exists())) return null;
      return new Response(Bun.gzipSync(new Uint8Array(await file.arrayBuffer())), {
        headers: { ...headers, "cache-control": "max-age=31536000, immutable" },
      });
    }
    return null;
  }

  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",

    async fetch(request) {
      const path = normalize(decodeURIComponent(new URL(request.url).pathname));
      if (!path.startsWith("/") || path.includes("..")) return new Response("not here", { status: 404 });

      const [, first, name, ...rest] = path.split("/");
      if (first === "strata" && name && Object.hasOwn(stores, name))
        return (await storeFile(stores[name]!, rest)) ?? new Response("not here", { status: 404 });

      const file = Bun.file(join(site, path.endsWith("/") ? `${path}index.html` : path));
      if (await file.exists()) return new Response(file, { headers });
      // A path holding nothing is the page's own, as a static host serves 404.html there.
      const page = Bun.file(join(site, "404.html"));
      if (await page.exists())
        return new Response(page, { status: 404, headers: { ...headers, "content-type": "text/html" } });
      return new Response("not here", { status: 404 });
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}/`,
    stop: () => server.stop(true),
  };
}
