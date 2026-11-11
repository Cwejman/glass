// The engine's end of the one protocol, wherever the engine runs: each message answered
// once, and each subscription answered again whenever what it reads has changed. The
// worker in the browser serves one interface with it; an engine on this machine serves
// every interface that reaches it, each its own serving.

import { canonical } from "../integrations/glass/canonical.ts";
import type { Engine, Read } from "./engine.ts";
import type { Message, Reply } from "./protocol.ts";

const wordsOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

type Serving = {
  // How a store named by an address is attached here, if this host attaches at all.
  attach: (key: string, url: string) => Promise<void>;
  send: (reply: Reply) => void;
};

export function serving(engine: Engine, { attach, send }: Serving) {
  // Each subscription: what it reads, what it was told last, and the change it was last
  // read again for, so a read overtaken by a later one is never told.
  const subscriptions = new Map<number, { read: Read; last: string; asked: number }>();
  let changes = 0;

  async function answer(message: Message) {
    switch (message.op) {
      case "attach":
        await attach(message.key, message.url);
        return null;

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

        subscriptions.set(message.id, { read: message.read, last: canonical(value), asked: seen });
        return { subscription: message.id, value };
      }

      case "unsubscribe":
        subscriptions.delete(message.subscription);
        return null;
    }
  }

  // After every change to the field, each subscription is read again, and told only if
  // what it reads has changed.
  const stop = engine.onChange(() => {
    changes++;

    for (const [subscription, entry] of subscriptions) {
      const asked = (entry.asked = changes);
      const heard = () => subscriptions.has(subscription) && entry.asked === asked;

      engine.read(entry.read).then(
        (value) => {
          const text = canonical(value);
          if (!heard() || text === entry.last) return;

          entry.last = text;
          send({ subscription, value });
        },
        // What can no longer be read is told, so what was read last is not taken as now;
        // and what was told last is forgotten, so the read coming back is told too.
        (error) => {
          if (!heard()) return;

          entry.last = "";
          send({ subscription, error: wordsOf(error) });
        },
      );
    }
  });

  return {
    async receive(message: Message) {
      try {
        send({ id: message.id, ok: true, value: await answer(message) });
      } catch (error) {
        send({ id: message.id, ok: false, error: wordsOf(error) });
      }
    },

    // The interface is gone: nothing more is told it.
    close() {
      stop();
      subscriptions.clear();
    },
  };
}
