/// <reference lib="webworker" />

// The engine on its own thread in the browser, so it never holds up the drawing.
// The reader's home lives in the browser's storage, and so do the blocks it has pulled.

import { canonical } from "../integrations/glass/canonical.ts";
import { servedFiles } from "../integrations/glass/files.ts";
import { openStore } from "../integrations/glass/store.ts";
import { startEngine, type Read } from "./engine.ts";
import { idbFiles } from "./idb.ts";
import type { Message, Reply } from "./protocol.ts";

declare const self: DedicatedWorkerGlobalScope;

const pulled = idbFiles("glass-pulled-blocks");
// The home is the reader's own store, attached to be written; everything else is read.
const started = idbFiles("glass-home")
  .then(openStore)
  .then((home) => startEngine([{ key: "home", store: home, write: true }]));

const subscriptions = new Map<number, { read: Read; last: string }>();

// The stores fetched from an address, each with the head it was read at. Every few seconds
// each is asked whether it has moved on, and one that has is taken again, so what is
// drawn follows what is published while one looks.
const served = new Map<string, { url: string; head: string | null }>();
const every = 5000;

async function follow() {
  const engine = await started;

  for (const [key, was] of served) {
    const now = await openStore(servedFiles(was.url, await pulled)).catch(() => null);
    if (!now || now.head === was.head) continue;

    served.set(key, { url: was.url, head: now.head });
    await engine.renew(key, now);
  }

  setTimeout(follow, every);
}

setTimeout(follow, every);
let changes = 0;

const send = (reply: Reply) => self.postMessage(reply);

async function answer(message: Message) {
  const engine = await started;

  switch (message.op) {
    case "attach": {
      const url = new URL(message.url, self.location.href).href;
      const store = await openStore(servedFiles(url, await pulled));
      await engine.attach(message.key, store);
      served.set(message.key, { url, head: store.head });
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
