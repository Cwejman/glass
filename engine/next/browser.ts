// Entry for running the engine in a browser Worker, off the main thread, so drawing is
// never blocked. Its readers run on workers of their own, one per core.

import { workers } from "../../runtime/runtime.ts";
import { engine } from "./engine.ts";

export default () => engine({ readers: workers(), count: navigator.hardwareConcurrency });
