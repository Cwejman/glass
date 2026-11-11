import { join } from "node:path";
import { storesHere } from "../stores.ts";
import { host } from "./host.ts";

// Serves the site on this machine: the page and the client from what was built, each
// store live from its own folder, and one engine over them that the page mounts to, so
// what is drawn is what the field holds now. The home is the host's own, kept beside the
// site and never committed.

const hosted = await host({
  port: Number(process.env.PORT ?? 4330),
  stores: Object.fromEntries([...(await storesHere())].map(([name, { folder }]) => [name, folder])),
  home: join(import.meta.dir, "home"),
  site: join(import.meta.dir, "dist"),
});

console.log(`glass at ${hosted.url}, its engine at ${hosted.url}engine`);
