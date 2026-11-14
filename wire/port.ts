// A channel over a MessagePort, between a page and a worker or between two workers.
// Bytes that fill their buffer are transferred; bytes that view part of a larger buffer
// are copied. Messages sent before onmessage is set wait in the port.
//
// A MessagePort gives no signal when its other side closes, so close() first sends
// { close: true }.

import type { Channel, Message } from "./wire.ts";

const fills = (bytes: Uint8Array) => bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;

export function portChannel(port: MessagePort): Channel {
  const { promise: closed, resolve } = Promise.withResolvers<void>();
  let open = true;
  let handed = false;

  function send({ head, bytes, ports }: Message) {
    if (handed) throw new Error("it was handed on");
    if (!open) return;
    const transferred = new Set<Transferable>(bytes.filter(fills).map((each) => each.buffer as ArrayBuffer));
    port.postMessage({ head, bytes, ports }, [...transferred, ...ports]);
  }

  function receive(listener: (message: Message) => void) {
    port.onmessage = ({ data }) => (data.close ? end() : listener(data as Message));
  }

  function close() {
    if (open) port.postMessage({ close: true });
    end();
  }

  function end() {
    if (!open) return;
    open = false;
    port.close();
    resolve();
  }

  function handOn() {
    open = false;
    handed = true;
    return { port };
  }

  return { send, receive, close, closed, handOn };
}
