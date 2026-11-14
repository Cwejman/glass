// Entry for running strata on a machine over a .glass folder: as a module a runtime
// starts, given the folder, or as a process that hosts it on a Unix socket. Either way
// its compactor is started beside it, on a worker of its own.
//
//   bun stores/strata/machine.ts .glass /tmp/glass/main.sock

import { workers } from "../../runtime/runtime.ts";
import { host } from "../../wire/socket.ts";
import { folderStorage } from "./storage/folder.ts";
import { strata } from "./strata.ts";

const compactorCode = new URL("./compactor-machine.ts", import.meta.url);

export default async function started({ folder }: { folder: string }) {
  await workers().run(compactorCode, { folder });
  return strata(folderStorage(folder));
}

if (import.meta.main) host(process.argv[3]!, await started({ folder: process.argv[2]! }));
