// Entry for running strata on a machine over a .glass folder: as a module a runtime
// starts, given the folder, or as a process that hosts it on a Unix socket.
//
//   bun stores/strata/machine.ts .glass /tmp/glass/main.sock

import { folderStorage } from "./storage/folder.ts";
import { host } from "../../wire/socket.ts";
import { strata } from "./strata.ts";

export default ({ folder }: { folder: string }) => strata(folderStorage(folder));

if (import.meta.main) host(process.argv[3]!, strata(folderStorage(process.argv[2]!)));
