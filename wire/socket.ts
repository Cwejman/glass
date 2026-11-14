// host and connect over Unix sockets, for processes on one machine, whoever started them.
// Messages are sent as length-prefixed frames.
//
// connect() opens the socket at the first call, so a proxy that is only passed on to
// another process sends its address and never connects.

import { rmSync } from "node:fs";
import { createConnection, createServer, type Socket } from "node:net";
import { objectServedOn, serveObject, type Channel, type Message } from "./wire.ts";

// Serves the object to every connection made to the socket at address. Returns a
// function that stops listening.
export function host(address: string, object: object) {
  rmSync(address, { force: true });
  const server = createServer((socket) =>
    serveObject(
      socketChannel(() => socket),
      object,
    ),
  );
  server.listen(address);
  return () => void server.close();
}

export function connect<T extends object>(address: string): T {
  return objectServedOn<T>(socketChannel(() => createConnection(address), address));
}

// A channel over a socket that opens on first use. Only a channel made by connect knows
// its address, so only it can be passed on.
function socketChannel(open: () => Socket, address?: string): Channel {
  const { promise: closed, resolve } = Promise.withResolvers<void>();
  let socket: Socket | null = null;
  let listener: ((message: Message) => void) | null = null;
  let live = true;
  let handed = false;
  const take = unframing((message) => listener?.(message));

  function opened() {
    if (socket) return socket;
    socket = open();
    socket.on("data", take);
    socket.on("close", end);
    socket.on("error", end);
    return socket;
  }

  function send(message: Message) {
    if (handed) throw new Error("it was handed on");
    if (live) opened().write(frame(message));
  }

  function receive(next: (message: Message) => void) {
    listener = next;
    if (address === undefined) opened();
  }

  function end() {
    if (!live) return;
    live = false;
    socket?.destroy();
    resolve();
  }

  function handOn() {
    if (address === undefined) throw new Error("a connection a host accepted cannot be handed on");
    live = false;
    handed = true;
    socket?.end();
    return { address };
  }

  return {
    send,
    receive,
    close: end,
    closed,
    handOn,
    connect: (to) => socketChannel(() => createConnection(to), to),
    another:
      address === undefined ? undefined : () => socketChannel(() => createConnection(address), address),
  };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Frame layout, every length a uint32: the frame's length, the head's length, the head
// as JSON, the number of byte arrays, then each array's length and bytes.
function frame({ head, bytes, ports }: Message): Uint8Array {
  if (ports.length) throw new Error("a port cannot travel over a socket");

  const said = encoder.encode(JSON.stringify(head));
  const length = 8 + said.length + bytes.reduce((sum, each) => sum + 4 + each.length, 0);
  const framed = new Uint8Array(4 + length);
  const view = new DataView(framed.buffer);
  let at = 0;

  function count(n: number) {
    view.setUint32(at, n);
    at += 4;
  }

  function put(part: Uint8Array) {
    framed.set(part, at);
    at += part.length;
  }

  count(length);
  count(said.length);
  put(said);
  count(bytes.length);

  for (const each of bytes) {
    count(each.length);
    put(each);
  }

  return framed;
}

function unframe(body: Uint8Array): Message {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let at = 0;

  function count() {
    at += 4;
    return view.getUint32(at - 4);
  }

  function take(length: number) {
    at += length;
    return body.slice(at - length, at);
  }

  const head = JSON.parse(decoder.decode(take(count())));
  const bytes = Array.from({ length: count() }, () => take(count()));

  return { head, bytes, ports: [] };
}

// Reassembles frames from socket data, which arrives in chunks of any size.
function unframing(arrived: (message: Message) => void) {
  let pending = new Uint8Array(0);

  return (piece: Uint8Array) => {
    const joined = new Uint8Array(pending.length + piece.length);
    joined.set(pending);
    joined.set(piece, pending.length);
    pending = joined;

    while (pending.length >= 4) {
      const length = new DataView(pending.buffer, pending.byteOffset).getUint32(0);
      if (pending.length < 4 + length) return;

      arrived(unframe(pending.subarray(4, 4 + length)));
      pending = pending.slice(4 + length);
    }
  };
}
