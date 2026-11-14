// Calling an object that lives in another worker or process as if it were local.
//
// serveObject(channel, object) answers calls arriving on one end of a channel.
// objectServedOn(channel) returns a proxy at the other end: calling one of its methods
// sends the call across and resolves with the result. A store or an engine is used the
// same way, local or served elsewhere. anotherConnectionTo(object) opens a second,
// independent channel to the same object, for instance one for each worker of a pool.
//
// What may cross:
//   1. Methods are async. Arguments and results are JSON-compatible data.
//   2. A Uint8Array is sent as raw bytes, not encoded. The sender must not reuse it.
//   3. A function argument is a listener the other side calls. The method returns a
//      function that stops it.
//   4. A proxy passed as an argument moves its channel to the receiver, so the two talk
//      directly: in a browser its port is transferred, on a machine its socket address
//      is sent. The sender can no longer use it.
//
// Channels: port.ts for MessagePorts; socket.ts for Unix sockets, with host and connect.

import { portChannel } from "./port.ts";

export type Message = { head: unknown; bytes: Uint8Array[]; ports: MessagePort[] };

export type Channel = {
  send(message: Message): void;
  receive(listener: (message: Message) => void): void;
  close(): void;
  closed: Promise<void>;
  // Gives up this end so it can be sent in a message: the port itself, or the address
  // to reconnect to. Sending on it afterwards throws.
  handOn(): { port: MessagePort } | { address: string };
  // Opens a channel to an address received in a message. Only socket channels can.
  connect?(address: string): Channel;
  // Opens another channel to the same object without asking it: a socket made by connect
  // connects to its address again. Port channels ask the serving side instead.
  another?(): Channel;
};

type Call = { id: number; method: string; args: unknown[] };
type Result = { id: number; value?: unknown; problem?: string };
type Heard = { listener: number; args: unknown[] };
type Stop = { stop: number };

const stoppedProblem = "it has stopped";
const anotherConnection = "$anotherConnection";
const wordsOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// The channel behind each proxy made by objectServedOn.
const channels = new WeakMap<object, Channel>();

// How many channels each object is served on, and what resolves when the last one closes.
const served = new Map<object, { count: number; gone: PromiseWithResolvers<void> }>();

// Answers each call arriving on the channel by calling the method of that name on the
// object. An error thrown is sent back as the call's problem. A request for another
// connection is answered with a new port, on which the object is served as well.
export function serveObject(channel: Channel, object: object) {
  const stops = new Map<number, () => void>();
  const serving = served.get(object) ?? { count: 0, gone: Promise.withResolvers<void>() };
  served.set(object, serving);
  serving.count++;

  channel.receive(async (message) => {
    const head = message.head as Call | Stop;

    if ("stop" in head) {
      stops.get(head.stop)?.();
      stops.delete(head.stop);
      return;
    }

    try {
      if (head.method === anotherConnection) {
        const { port1, port2 } = new MessageChannel();
        serveObject(portChannel(port1), object);
        return channel.send(pack({ id: head.id, value: port2 }));
      }

      const method = (object as Record<string, unknown>)[head.method];
      if (!Object.hasOwn(object, head.method) || typeof method !== "function")
        throw new Error(`there is no method ${head.method}`);

      const { args } = unpack(message, channel, listenerAt) as Call;
      const value = await method.apply(object, args);
      if (typeof value === "function") stops.set(head.id, value as () => void);

      channel.send(pack({ id: head.id, value: typeof value === "function" ? { $stop: true } : value }));
    } catch (error) {
      channel.send(pack({ id: head.id, problem: wordsOf(error) }));
    }
  });

  channel.closed.then(() => {
    for (const stop of stops.values()) stop();
    stops.clear();

    if (--serving.count) return;
    served.delete(object);
    serving.gone.resolve();
  });

  function listenerAt(listener: number) {
    return (...args: unknown[]) => channel.send(pack({ listener, args }));
  }
}

// A proxy for the object served at the other end of the channel.
export function objectServedOn<T extends object>(channel: Channel): T {
  const waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const listeners = new Map<number, (...args: unknown[]) => void>();
  const listenersOf = new Map<number, number[]>();
  let next = 1;
  let open = true;

  channel.receive((message) => {
    const said = unpack(message, channel) as Result | Heard;
    if ("listener" in said) return void listeners.get(said.listener)?.(...said.args);

    const call = waiting.get(said.id);
    waiting.delete(said.id);

    if (said.problem !== undefined) call?.reject(new Error(said.problem));
    else call?.resolve(isStop(said.value) ? stopFor(said.id) : said.value);
  });

  channel.closed.then(() => {
    open = false;
    for (const { reject } of waiting.values()) reject(new Error(stoppedProblem));
    waiting.clear();
    listeners.clear();
  });

  function call(method: string, args: unknown[]) {
    return new Promise((resolve, reject) => {
      if (!open) return reject(new Error(stoppedProblem));

      const id = next++;
      const given: number[] = [];
      const message = pack({ id, method, args }, (listener) => {
        const at = next++;
        listeners.set(at, listener);
        given.push(at);
        return at;
      });

      if (given.length) listenersOf.set(id, given);
      waiting.set(id, { resolve, reject });
      channel.send(message);
    });
  }

  // The function returned to a call that passed listeners: it forgets them here and
  // tells the other side to stop.
  function stopFor(id: number) {
    return () => {
      for (const listener of listenersOf.get(id) ?? []) listeners.delete(listener);
      listenersOf.delete(id);
      if (open) channel.send(pack({ stop: id } satisfies Stop));
    };
  }

  // Every property is a remote method except then, which would make awaiting the proxy,
  // or returning it from an async function, treat it as a promise.
  const remote = new Proxy(
    {},
    {
      get: (_, method) =>
        typeof method === "string" && method !== "then"
          ? (...args: unknown[]) => call(method, args)
          : undefined,
    },
  );

  channels.set(remote, channel);
  return remote as T;
}

// A second, independent connection to the object behind a proxy, to hand to another
// worker. A local object is its own connection, and comes back as it is.
export async function anotherConnectionTo<T extends object>(object: T): Promise<T> {
  const channel = channels.get(object);
  if (!channel) return object;
  if (channel.another) return objectServedOn<T>(channel.another());

  const ask = (object as Record<string, () => Promise<T>>)[anotherConnection]!;
  return ask();
}

// Closes the channel behind a proxy. Does nothing for a local object.
export function disconnect(object: object) {
  channels.get(object)?.close();
}

// Resolves when a proxy's channel closes, from either side. Never, for a local object.
export function disconnected(object: object): Promise<void> {
  return channels.get(object)?.closed ?? new Promise(() => {});
}

// Resolves when the last channel an object is served on closes.
export function noLongerServed(object: object): Promise<void> {
  return served.get(object)?.gone.promise ?? Promise.resolve();
}

const isStop = (value: unknown) =>
  value !== null && typeof value === "object" && (value as { $stop?: unknown }).$stop === true;

// Replaces bytes, listeners and proxies in a head with placeholders, and collects what
// travels beside the head.
function pack(head: unknown, listen?: (listener: (...args: unknown[]) => void) => number): Message {
  const bytes: Uint8Array[] = [];
  const ports: MessagePort[] = [];

  const walk = (value: unknown): unknown => {
    if (value instanceof Uint8Array) return { $bytes: bytes.push(value) - 1 };
    if (value instanceof MessagePort) return { $port: ports.push(value) - 1 };

    if (typeof value === "function") {
      if (!listen) throw new Error("a function crosses only as a listener given to a method");
      return { $listener: listen(value as (...args: unknown[]) => void) };
    }

    if (value === null || typeof value !== "object") return value;

    const remote = channels.get(value);
    if (remote) {
      const handed = remote.handOn();
      return "port" in handed ? { $port: ports.push(handed.port) - 1 } : { $address: handed.address };
    }

    if (Array.isArray(value)) return value.map(walk);
    return Object.fromEntries(Object.entries(value).map(([key, part]) => [key, walk(part)]));
  };

  return { head: walk(head), bytes, ports };
}

// Puts back what pack replaced, on the receiving side.
function unpack(message: Message, channel: Channel, listenerAt?: (listener: number) => unknown): unknown {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (value === null || typeof value !== "object") return value;

    const said = value as Record<string, unknown>;
    if ("$bytes" in said) return message.bytes[said.$bytes as number];
    if ("$listener" in said) return listenerAt?.(said.$listener as number);
    if ("$port" in said) return objectServedOn(portChannel(message.ports[said.$port as number]!));
    if ("$address" in said) {
      if (!channel.connect) throw new Error("an address cannot be connected to from here");
      return objectServedOn(channel.connect(said.$address as string));
    }

    return Object.fromEntries(Object.entries(said).map(([key, part]) => [key, walk(part)]));
  };

  return walk(message.head);
}
