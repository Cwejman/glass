// Entry for running strata on a machine over a .glass folder: as a module a runtime
// starts, given the folder, or as a process that hosts it on a Unix socket. Either way
// its compactor is started beside it, on a worker of its own, and is disconnected once
// nothing is connected to the store, so its worker ends too: Bun leaves a worker's own
// workers running when the worker ends.
//
//   bun stores/strata/machine.ts .glass /tmp/glass/main.sock

import { workers } from "../../runtime/runtime.ts";
import { host } from "../../wire/socket.ts";
import { disconnect, noLongerServed } from "../../wire/wire.ts";
import { folderStorage } from "./storage/folder.ts";
import { strata } from "./strata.ts";

const compactorCode = new URL("./compactor-machine.ts", import.meta.url);

export default async function started({ folder }: { folder: string }) {
  const compacting = await workers().run(compactorCode, { folder });
  const store = strata(folderStorage(folder));

  noLongerServed(store).then(() => disconnect(compacting));
  return store;
}

if (import.meta.main) host(process.argv[3]!, await started({ folder: process.argv[2]! }));
