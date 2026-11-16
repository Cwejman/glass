// Entry for running the engine in a browser Worker, off the main thread, so drawing is
// never blocked. Its workers run one per core.

import { workers } from "../../runtime/runtime.ts";
import { engine } from "./engine.ts";

export default () => engine({ workers: workers(), count: navigator.hardwareConcurrency });
