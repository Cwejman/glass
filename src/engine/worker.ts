/// <reference lib="webworker" />
import type { Json } from "../store/canonical.ts";
import { canonical } from "../store/canonical.ts";
import { Store } from "../store/store.ts";
import { Engine, type Read } from "./engine.ts";
import { IdbBackend } from "./idb.ts";
import type { Message, Reply } from "./protocol.ts";
import { pull } from "./pull.ts";

// The engine on its own thread in the browser, so it never holds up the
// drawing. Its home lives in the browser's storage.

declare const self: DedicatedWorkerGlobalScope;

const started = (async () => {
  const engine = new Engine(new Store(await IdbBackend.open("glass-home")));
  await engine.start();
  return engine;
})();

const subscriptions = new Map<number, { read: Read; last: string }>();
const send = (reply: Reply) => self.postMessage(reply);

async function answer(message: Message): Promise<Json> {
  const engine = await started;
  switch (message.op) {
    case "attach":
      await engine.attach(message.key, await pull(new URL(message.url, self.location.href).href));
      return null;
    case "read":
      return engine.read(message.read);
    case "commit":
      return (await engine.commit(message.change)) ?? null;
    case "subscribe": {
      const value = await engine.read(message.read);
      subscriptions.set(message.id, { read: message.read, last: canonical(value) });
      return { subscription: message.id, value };
    }
    case "unsubscribe":
      subscriptions.delete(message.subscription);
      return null;
  }
}

// After every change to the field, each subscription is read again, and told
// only if what it reads has changed.
started.then((engine) =>
  engine.onChange(() => {
    for (const [subscription, entry] of subscriptions)
      engine.read(entry.read).then(
        (value) => {
          const text = canonical(value);
          if (text === entry.last || !subscriptions.has(subscription)) return;
          entry.last = text;
          send({ subscription, value });
        },
        (error) => console.error(`subscription ${subscription}:`, error),
      );
  }),
);

self.onmessage = async ({ data }: MessageEvent<Message>) => {
  try {
    send({ id: data.id, ok: true, value: await answer(data) });
  } catch (error) {
    send({ id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
