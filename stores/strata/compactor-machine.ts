// Entry for running strata's compactor on a machine, over a .glass folder, as a module a
// runtime starts beside the store.

import { compactor } from "./compactor.ts";
import { folderStorage } from "./storage/folder.ts";

export default ({ folder }: { folder: string }) => compactor(folderStorage(folder));
