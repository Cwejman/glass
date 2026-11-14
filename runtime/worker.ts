/// <reference lib="webworker" />

// The script every Worker started by workers() runs. It imports the module, calls its
// default export, and serves the result on the port it was sent, and on every further
// connection asked of it. It exits when the last of them closes. If starting fails it
// reports the error and leaves the runtime to terminate it: Bun crashes when a worker
// closes itself right after posting a message.

import { portChannel } from "../wire/port.ts";
import { noLongerServed, serveObject } from "../wire/wire.ts";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async ({ data: { module, given, port } }: MessageEvent) => {
  try {
    const object = await (await import(module)).default(given);

    serveObject(portChannel(port), object);
    noLongerServed(object).then(() => self.close());
    self.postMessage({ started: true });
  } catch (error) {
    self.postMessage({ problem: error instanceof Error ? error.message : String(error) });
  }
};
