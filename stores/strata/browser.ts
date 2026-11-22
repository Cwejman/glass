// Entry for running strata in a browser Worker. kept names the store's folder in OPFS
// and, for a store published with the site, the URL its blobs and head are served from.
// A published store is read lazily, each blob fetched from the site the first time a read
// needs it. With whole, every blob its head reaches is also fetched and kept in the
// background, the index first, then the commits and parts from the newest back, so it
// comes to read as a store on a machine does. That begins only once the store has answered
// its first reads and been asked nothing for a moment, so what the page draws first never
// waits behind it, and it still gives way to any blob a read waits on. Reads go
// through a pool of pages in memory, the browser keeping no page cache for OPFS.

import { blobsOf, indexNow } from "./head.ts";
import { browserStorages, type BrowserStorage, type Kept } from "./storage/browser.ts";
import { pooled } from "./storage/pool.ts";
import { strata } from "./strata.ts";

// So long the store is asked nothing before it keeps the rest.
const quiet = 1000;

export default async ({ whole = false, ...kept }: Kept & { whole?: boolean }) => {
  const storages = await browserStorages(kept);
  const store = strata({ history: pooled(storages.history), index: pooled(storages.index) });
  if (!whole) return store;

  let asked = 0;
  let begun = false;
  let waiting: ReturnType<typeof setTimeout> | undefined;
  const settle = () => {
    clearTimeout(waiting);
    if (begun || asked > 0) return;
    waiting = setTimeout(() => {
      begun = true;
      void keepAll(storages);
    }, quiet);
  };
  const read: typeof store.read = (head, question) => {
    asked++;
    clearTimeout(waiting);
    return store.read(head, question).finally(() => {
      asked--;
      settle();
    });
  };
  return { ...store, read };
};

// The index kept first, since every read needs it; then every commit and part, which
// walking the commits names.
async function keepAll({ history, index }: { history: BrowserStorage; index: BrowserStorage }) {
  await index.keep((await indexNow(index))?.runs.map(({ blob }) => blob) ?? []);
  await history.keep((await blobsOf({ history, index })).history);
}
