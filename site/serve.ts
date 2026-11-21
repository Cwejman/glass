import { join } from "node:path";
import { storesHere } from "../stores.ts";
import { host } from "./host.ts";

// Serves the site on this machine: the page and its modules from what was built, and
// each store live from its own folder, so a page opened reads what the field holds now.

const hosted = host({
  port: Number(process.env.PORT ?? 4330),
  stores: Object.fromEntries([...(await storesHere())].map(([name, { folder }]) => [name, folder])),
  site: join(import.meta.dir, "dist"),
});

console.log(`glass at ${hosted.url}`);
