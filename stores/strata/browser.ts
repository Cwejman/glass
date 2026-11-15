// Entry for running strata in a browser Worker. kept names the store's folder in OPFS
// and, for a store published with the site, the URL its blobs and head are served from.
// A published store is read lazily, each blob fetched from the site the first time it is
// read, unless whole is asked: then every blob its head reaches is fetched and kept
// before strata starts, so it reads as a store on a machine does. Reads go through a pool
// of pages in memory, the browser keeping no page cache for OPFS.

import { blobsOf } from "./head.ts";
import { browserStorage, type Kept } from "./storage/browser.ts";
import { pooled } from "./storage/pool.ts";
import { strata } from "./strata.ts";

export default async ({ whole = false, ...kept }: Kept & { whole?: boolean }) => {
  const storage = await browserStorage(kept);
  if (whole) await loaded(storage);
  return strata(pooled(storage));
};

// Every blob the head reaches read once, so each is fetched and kept, a few at a time.
export async function loaded(storage: Awaited<ReturnType<typeof browserStorage>>) {
  const blobs = await blobsOf(storage);
  const fetching = 8;
  await Promise.all(
    Array.from({ length: fetching }, async (_, start) => {
      for (let i = start; i < blobs.length; i += fetching) await storage.read(blobs[i]!, 0, 1);
    }),
  );
}
