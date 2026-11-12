// The interface's end of the one protocol: requests to the engine, each answered once,
// and subscriptions answered again whenever what they read changes. The engine is
// reached through a port: its own thread in the browser, or a socket to an engine running
// elsewhere, as one on this machine.

import type { Change, Committed } from "../engine/compat.ts";
import type { Message, Reply, Request } from "../engine/serve/protocol.ts";
import type { Answer, Read } from "../engine/compat.ts";

export type Subscription<T> = { value: T; close: () => void };

export type Connection = ReturnType<typeof connect>;

// What carries the protocol: a message sent, and each message that comes back.
export type Port = {
  postMessage(message: Message): void;
  onmessage: ((event: MessageEvent<Reply>) => void) | null;
};

// A socket to an engine at an address, as a port: what is sent before it opens waits.
// When it is lost, what was asked and never answered is answered that the engine is gone,
// and whoever opened it is told whether it had ever opened.
export function socketPort(url: string, lost: (opened: boolean) => void): Port {
  const socket = new WebSocket(url);
  const waiting: string[] = [];
  const unanswered = new Set<number>();
  let opened = false;

  const told = (data: Reply) => port.onmessage?.(new MessageEvent("message", { data }));
  const port: Port = {
    postMessage(message) {
      const text = JSON.stringify(message);
      unanswered.add(message.id);
      if (socket.readyState === WebSocket.OPEN) socket.send(text);
      else waiting.push(text);
    },
    onmessage: null,
  };

  socket.onopen = () => {
    opened = true;
    waiting.splice(0).forEach((text) => socket.send(text));
  };

  socket.onmessage = ({ data }) => {
    const reply = JSON.parse(String(data)) as Reply;
    if ("id" in reply) unanswered.delete(reply.id);
    told(reply);
  };

  socket.onclose = () => {
    for (const id of unanswered) told({ id, ok: false, error: `the engine at ${url} is gone` });
    unanswered.clear();
    lost(opened);
  };

  return port;
}

export function connect(worker: Port) {
  let next = 1;
  const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const listeners = new Map<number, { told: (value: unknown) => void; failed: (error: Error) => void }>();

  worker.onmessage = ({ data }) => {
    if ("subscription" in data) {
      const listener = listeners.get(data.subscription);
      if ("error" in data) listener?.failed(new Error(data.error));
      else listener?.told(data.value);
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

  // A subscription is told each new value, and told when what it reads can no longer be read.
  async function subscribe<R extends Read>(
    query: R,
    listener: (value: Answer<R>) => void,
    failed: (error: Error) => void,
  ): Promise<Subscription<Answer<R>>> {
    const id = next++;
    listeners.set(id, { told: listener as (value: unknown) => void, failed });

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
