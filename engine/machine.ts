// Entry for running the engine on a machine: as a module a runtime starts, or as a
// process that hosts the engine on a Unix socket. Its workers run one per
// core.
//
//   bun engine/machine.ts /tmp/glass/engine.sock

import { workers } from "../runtime/runtime.ts";
import { host } from "../wire/socket.ts";
import { engine } from "./engine.ts";

const started = () => engine({ workers: workers(), count: navigator.hardwareConcurrency });

export default started;

if (import.meta.main) host(process.argv[2]!, await started());
