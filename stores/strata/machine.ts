// Entry for running strata on a machine over a .glass folder: as a module a runtime
// starts, given the folder; or as a process of its own, which hosts it on a Unix socket
// and, as its own orchestrator, starts its compactor beside it on a worker.
//
//   bun stores/strata/machine.ts .glass /tmp/glass/main.sock

import { workers } from "../../runtime/runtime.ts";
import { host } from "../../wire/socket.ts";
import { folderStorage } from "./storage/folder.ts";
import { strata } from "./strata.ts";

export default ({ folder }: { folder: string }) => strata(folderStorage(folder));

if (import.meta.main) {
  const [folder, address] = process.argv.slice(2);
  await workers().run(new URL("./compactor-machine.ts", import.meta.url), { folder });
  host(address!, strata(folderStorage(folder!)));
}
