import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { Change, HolonRead, Read } from "../engine/engine.ts";
import type { Message, Reply, Request } from "../engine/protocol.ts";

// The interface's end of the one protocol: requests to the engine's thread,
// each answered once, and subscriptions answered again whenever what they
// read changes. A holon read arrives as a holon.

export interface Subscription<T> {
  value: T;
  close: () => void;
}

export interface Connection {
  attach(key: string, url: string): Promise<Json>;
  read(read: Read): Promise<Json>;
  holon(id: Id, at?: Name): Promise<HolonRead | null>;
  commit(change: Change): Promise<Name | null>;
  subscribe(read: Read, listener: (value: Json) => void): Promise<Subscription<Json>>;
  subscribeHolon(id: Id, listener: (holon: HolonRead | null) => void): Promise<Subscription<HolonRead | null>>;
}

export function connect(worker: Worker): Connection {
  let next = 1;
  const waiting = new Map<number, { resolve: (value: Json) => void; reject: (error: Error) => void }>();
  const listeners = new Map<number, (value: Json) => void>();

  worker.onmessage = ({ data }: MessageEvent<Reply>) => {
    if ("subscription" in data) return listeners.get(data.subscription)?.(data.value);
    const answer = waiting.get(data.id);
    waiting.delete(data.id);
    if (data.ok) answer?.resolve(data.value);
    else answer?.reject(new Error(data.error));
  };

  const send = (request: Request, id = next++): Promise<Json> =>
    new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      worker.postMessage({ id, ...request } satisfies Message);
    });

  const read = (query: Read) => send({ op: "read", read: query });

  const subscribe = async (query: Read, listener: (value: Json) => void): Promise<Subscription<Json>> => {
    const id = next++;
    listeners.set(id, listener);
    const { value } = (await send({ op: "subscribe", read: query }, id)) as { subscription: number; value: Json };
    return {
      value,
      close: () => {
        listeners.delete(id);
        void send({ op: "unsubscribe", subscription: id });
      },
    };
  };

  return {
    attach: (key, url) => send({ op: "attach", key, url }),
    read,
    holon: async (id, at) => (await read(at ? { holon: id, at } : { holon: id })) as unknown as HolonRead | null,
    commit: async (change) => (await send({ op: "commit", change })) as Name | null,
    subscribe,
    subscribeHolon: async (id, listener) => {
      const subscription = await subscribe({ holon: id }, (value) => listener(value as unknown as HolonRead | null));
      return { ...subscription, value: subscription.value as unknown as HolonRead | null };
    },
  };
}
