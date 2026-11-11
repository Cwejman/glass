// The interface's end of the one protocol: requests to the engine's thread, each
// answered once, and subscriptions answered again whenever what they read changes.

import type { Change, Committed } from "../engine/engine.ts";
import type { Message, Reply, Request } from "../engine/protocol.ts";
import type { Answer, Read } from "../engine/reads.ts";

export type Subscription<T> = { value: T; close: () => void };

export type Connection = ReturnType<typeof connect>;

export function connect(worker: Worker) {
  let next = 1;
  const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const listeners = new Map<number, (value: unknown) => void>();

  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    if ("subscription" in data) {
      listeners.get(data.subscription)?.(data.value);
      return;
    }

    const answer = waiting.get(data.id);
    waiting.delete(data.id);

    if (data.ok) answer?.resolve(data.value);
    else answer?.reject(new Error(data.error));
  };

  const send = (request: Request, id = next++) =>
    new Promise<unknown>((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker.postMessage({ id, ...request } satisfies Message);
    });

  const read = <R extends Read>(query: R) => send({ op: "read", read: query }) as Promise<Answer<R>>;

  async function subscribe<R extends Read>(
    query: R,
    listener: (value: Answer<R>) => void,
  ): Promise<Subscription<Answer<R>>> {
    const id = next++;
    listeners.set(id, listener as (value: unknown) => void);

    try {
      const { value } = (await send({ op: "subscribe", read: query }, id)) as { value: Answer<R> };

      return {
        value,
        close() {
          listeners.delete(id);
          void send({ op: "unsubscribe", subscription: id });
        },
      };
    } catch (error) {
      listeners.delete(id);
      throw error;
    }
  }

  return {
    attach: (key: string, url: string) => send({ op: "attach", key, url }),
    read,
    holon: (id: string) => read({ holon: id }),
    commit: (change: Change) => send({ op: "commit", change }) as Promise<Committed>,
    subscribe,
  };
}
