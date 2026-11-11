/// <reference lib="webworker" />

// The engine on its own thread in the browser, so it never holds up the drawing.
// Its home lives in the browser's storage, and so do the blocks it has pulled.

import { canonical } from "../integrations/glass/canonical.ts";
import { servedFiles } from "../integrations/glass/files.ts";
import { openStore } from "../integrations/glass/store.ts";
import { startEngine, type Read } from "./engine.ts";
import { idbFiles } from "./idb.ts";
import type { Message, Reply } from "./protocol.ts";

declare const self: DedicatedWorkerGlobalScope;

const pulled = idbFiles("glass-pulled-blocks");
const started = idbFiles("glass-home").then(openStore).then(startEngine);

const subscriptions = new Map<number, { read: Read; last: string }>();
let changes = 0;

const send = (reply: Reply) => self.postMessage(reply);

async function answer(message: Message) {
  const engine = await started;

  switch (message.op) {
    case "attach": {
      const url = new URL(message.url, self.location.href).href;
      await engine.attach(message.key, await openStore(servedFiles(url, await pulled)));
      return null;
    }

    case "read":
      return engine.read(message.read);

    case "commit":
      return engine.commit(message.change);

    // A change while it reads is read again, so what it starts from is never already old.
    case "subscribe": {
      let value: unknown;
      let seen: number;

      do {
        seen = changes;
        value = await engine.read(message.read);
      } while (seen !== changes);

      subscriptions.set(message.id, { read: message.read, last: canonical(value) });
      return { subscription: message.id, value };
    }

    case "unsubscribe":
      subscriptions.delete(message.subscription);
      return null;
  }
}

// After every change to the field, each subscription is read again, and told only
// if what it reads has changed.
function tellSubscribers(read: (query: Read) => Promise<unknown>) {
  for (const [subscription, entry] of subscriptions) {
    read(entry.read).then(
      (value) => {
        const text = canonical(value);
        if (text === entry.last || !subscriptions.has(subscription)) return;

        entry.last = text;
        send({ subscription, value });
      },
      (error) => console.error(`subscription ${subscription}:`, error),
    );
  }
}

started.then((engine) =>
  engine.onChange(() => {
    changes++;
    tellSubscribers(engine.read);
  }),
);

self.onmessage = async ({ data }: MessageEvent<Message>) => {
  try {
    send({ id: data.id, ok: true, value: await answer(data) });
  } catch (error) {
    send({ id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
