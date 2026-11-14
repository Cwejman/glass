// Entry for running strata in a browser Worker. kept names the store's folder in OPFS
// and, for a store published with the site, the URL its blobs and head are served from.
// Whoever starts a store the reader writes starts its compactor beside it too, from
// compactor-browser.ts; a published store is only read, and has nothing to compact.

import { browserStorage, type Kept } from "./storage/browser.ts";
import { strata } from "./strata.ts";

export default async (kept: Kept) => strata(await browserStorage(kept));
