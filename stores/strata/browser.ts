// Entry for running strata in a browser Worker. kept names the store's folder in OPFS
// and, for a store published with the site, the URL to fetch pages from that OPFS does
// not have yet. Pages read are held in memory.

import { browserStorage, type Kept } from "./storage/browser.ts";
import { strata } from "./strata.ts";

export default async (kept: Kept) => strata(await browserStorage(kept));
