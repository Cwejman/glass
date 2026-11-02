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

export class Connection {
  private next = 1;
  private readonly waiting = new Map<number, { resolve: (value: Json) => void; reject: (error: Error) => void }>();
  private readonly listeners = new Map<number, (value: Json) => void>();

  constructor(private readonly worker: Worker) {
    worker.onmessage = ({ data }: MessageEvent<Reply>) => {
      if ("subscription" in data) return this.listeners.get(data.subscription)?.(data.value);
      const waiting = this.waiting.get(data.id);
      this.waiting.delete(data.id);
      if (data.ok) waiting?.resolve(data.value);
      else waiting?.reject(new Error(data.error));
    };
  }

  attach(key: string, url: string) {
    return this.send(this.next++, { op: "attach", key, url });
  }

  read(read: Read) {
    return this.send(this.next++, { op: "read", read });
  }

  async holon(id: Id, at?: Name): Promise<HolonRead | null> {
    return (await this.read(at ? { holon: id, at } : { holon: id })) as unknown as HolonRead | null;
  }

  async commit(change: Change) {
    return (await this.send(this.next++, { op: "commit", change })) as Name | null;
  }

  async subscribe(read: Read, listener: (value: Json) => void): Promise<Subscription<Json>> {
    const id = this.next++;
    this.listeners.set(id, listener);
    const { value } = (await this.send(id, { op: "subscribe", read })) as { subscription: number; value: Json };
    return {
      value,
      close: () => {
        this.listeners.delete(id);
        void this.send(this.next++, { op: "unsubscribe", subscription: id });
      },
    };
  }

  async subscribeHolon(id: Id, listener: (holon: HolonRead | null) => void): Promise<Subscription<HolonRead | null>> {
    const subscription = await this.subscribe({ holon: id }, (value) => listener(value as unknown as HolonRead | null));
    return { ...subscription, value: subscription.value as unknown as HolonRead | null };
  }

  private send(id: number, request: Request): Promise<Json> {
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...request } satisfies Message);
    });
  }
}
