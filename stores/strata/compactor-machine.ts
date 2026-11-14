// Entry for running strata's compactor on a machine, over a .glass folder, as a module a
// runtime starts beside the store. It stops watching once nothing is connected to it:
// in Bun, a worker that closes itself keeps its open handles running.

import { noLongerServed } from "../../wire/wire.ts";
import { compactor } from "./compactor.ts";
import { folderStorage } from "./storage/folder.ts";

export default ({ folder }: { folder: string }) => {
  const compacting = compactor(folderStorage(folder));
  noLongerServed(compacting).then(compacting.stop);
  return compacting;
};
