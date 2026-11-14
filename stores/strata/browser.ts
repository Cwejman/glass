// Entry for running strata in a browser Worker. kept names the store's folder in OPFS
// and, for a store published with the site, the URL its blobs and head are served from.
// A store the reader writes gets its compactor beside it, on a Worker of its own, which
// is disconnected once nothing is connected to the store; a published store is only
// read, and has nothing to compact.

import { workers } from "../../runtime/runtime.ts";
import { disconnect, noLongerServed } from "../../wire/wire.ts";
import { browserStorage, type Kept } from "./storage/browser.ts";
import { strata } from "./strata.ts";

const compactorCode = new URL("./compactor-browser.ts", import.meta.url);

export default async function started(kept: Kept) {
  const store = strata(await browserStorage(kept));
  if (kept.from) return store;

  const compacting = await workers().run(compactorCode, kept);
  noLongerServed(store).then(() => disconnect(compacting));
  return store;
}
