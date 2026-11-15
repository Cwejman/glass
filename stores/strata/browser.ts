// Entry for running strata in a browser Worker. kept names the store's folder in OPFS
// and, for a store published with the site, the URL its blobs and head are served from.
// A published store is read lazily, each blob fetched from the site the first time a read
// needs it. With whole, every blob its head reaches is also fetched and kept in the
// background, the index first, then the commits and parts from the newest back, behind
// any blob a read waits on, so it comes to read as a store on a machine does. Reads go
// through a pool of pages in memory, the browser keeping no page cache for OPFS.

import { blobsOf, stateNow } from "./head.ts";
import { browserStorage, type BrowserStorage, type Kept } from "./storage/browser.ts";
import { pooled } from "./storage/pool.ts";
import { strata } from "./strata.ts";

export default async ({ whole = false, ...kept }: Kept & { whole?: boolean }) => {
  const storage = await browserStorage(kept);
  if (whole) void keepAll(storage);
  return strata(pooled(storage));
};

// The index kept first, since every read needs it; then every other blob the head
// reaches, which walking the commits names.
async function keepAll(storage: BrowserStorage) {
  await storage.keep((await stateNow(storage))?.runs.map(({ blob }) => blob) ?? []);
  await storage.keep(await blobsOf(storage));
}
