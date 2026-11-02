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

const engine = (async () => {
  const engine = new Engine(new Store(await IdbBackend.open("glass-home")));
  await engine.start();
  return engine;
})();

const subscriptions = new Map<number, { read: Read; last: string }>();
const send = (reply: Reply) => self.postMessage(reply);

async function answer(message: Message): Promise<Json> {
  const field = await engine;
  switch (message.op) {
    case "attach":
      await field.attach(message.key, await pull(new URL(message.url, self.location.href).href));
      return null;
    case "read":
      return field.read(message.read);
    case "commit":
      return (await field.commit(message.commit)) ?? null;
    case "subscribe": {
      const value = await field.read(message.read);
      subscriptions.set(message.id, { read: message.read, last: canonical(value) });
      return { subscription: message.id, value };
    }
    case "unsubscribe":
      subscriptions.delete(message.subscription);
      return null;
  }
}

// After every commit, each subscription is read again, and told only if what
// it reads has changed.
engine.then((field) =>
  field.onChange(async () => {
    for (const [subscription, entry] of subscriptions) {
      const value = await field.read(entry.read);
      const text = canonical(value);
      if (text === entry.last) continue;
      entry.last = text;
      send({ subscription, value });
    }
  }),
);

self.onmessage = async ({ data }: MessageEvent<Message>) => {
  try {
    send({ id: data.id, ok: true, value: await answer(data) });
  } catch (error) {
    send({ id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
