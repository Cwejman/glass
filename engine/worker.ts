/// <reference lib="webworker" />

// The engine on its own thread in the browser, so it never holds up the drawing: the
// engine a published site runs in its reader's client. The reader's home lives in the
// browser's storage, and so do the blocks it has pulled.

import { servedFiles } from "../integrations/glass/files.ts";
import { openStore } from "../integrations/glass/store.ts";
import { startEngine } from "./compat.ts";
import { idbFiles } from "./idb.ts";
import type { Message } from "./protocol.ts";
import { serving } from "./serving.ts";

declare const self: DedicatedWorkerGlobalScope;

const pulled = idbFiles("glass-pulled-blocks");

// The home is the reader's own store, attached to be written; everything else is read.
const served = idbFiles("glass-home")
  .then(openStore)
  .then((home) => startEngine([{ key: "home", store: home, write: true }]))
  .then((engine) =>
    serving(engine, {
      attach: async (key, url) => {
        const at = new URL(url, self.location.href).href;
        await engine.attach(key, await openStore(servedFiles(at, await pulled)));
      },
      send: (reply) => self.postMessage(reply),
    }),
  );

self.onmessage = async ({ data }: MessageEvent<Message>) => (await served).receive(data);
