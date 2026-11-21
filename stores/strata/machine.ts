// Entry for running strata on a machine over a .glass folder: as a module a runtime
// starts, given the folder; or as a process of its own, which hosts it on a Unix socket.
//
//   bun stores/strata/machine.ts .glass /tmp/glass/glass.sock

import { host } from "../../wire/socket.ts";
import { folderStorages } from "./storage/folder.ts";
import { strata } from "./strata.ts";

export default ({ folder }: { folder: string }) => strata(folderStorages(folder));

if (import.meta.main) {
  const [folder, address] = process.argv.slice(2);
  host(address!, strata(folderStorages(folder!)));
}
