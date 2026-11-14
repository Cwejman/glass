// Entry for running strata's compactor in a browser Worker, beside a store the reader
// writes. It stops watching once nothing is connected to it.

import { noLongerServed } from "../../wire/wire.ts";
import { compactor } from "./compactor.ts";
import { browserStorage, type Kept } from "./storage/browser.ts";

export default async (kept: Kept) => {
  const compacting = compactor(await browserStorage(kept));
  noLongerServed(compacting).then(compacting.stop);
  return compacting;
};
