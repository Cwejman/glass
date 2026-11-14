// A runtime starts modules. run(module, given) imports the module, calls its default
// export with given, and returns the object it returned: a proxy to it (wire.ts) where
// the module runs elsewhere, or the object itself where it runs in the calling thread.
//
// The page, or the process glass was launched in, is the first runtime; nothing starts it.

import { portChannel } from "../wire/port.ts";
import { objectServedOn } from "../wire/wire.ts";

export type Runtime = {
  run<T extends object>(module: URL, given?: unknown): Promise<T>;
};

// Starts each module in its own Worker, in a browser or Bun. run resolves once the module
// has started; if it fails, run rejects with the error and the worker is terminated. A
// worker exits when the last connection to its object closes.
export function workers(): Runtime {
  async function run<T extends object>(module: URL, given: unknown = null) {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const { port1, port2 } = new MessageChannel();

    const started = new Promise<void>((resolve, reject) => {
      worker.onmessage = ({ data }) => (data.problem ? reject(new Error(data.problem)) : resolve());
      worker.onerror = (event) => reject(new Error(event.message));
    });

    worker.postMessage({ module: module.href, given, port: port2 }, [port2]);
    await started.catch((problem) => {
      worker.terminate();
      throw problem;
    });

    return objectServedOn<T>(portChannel(port1));
  }

  return { run };
}

// Runs each module in the calling thread: its default export is called directly, and
// the object it returns is used as it is, with no wire between.
export function sameThread(): Runtime {
  async function run<T extends object>(module: URL, given: unknown = null) {
    const { default: start } = await import(module.href);
    return (await start(given)) as T;
  }

  return { run };
}
