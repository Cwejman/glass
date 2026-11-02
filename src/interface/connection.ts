import type { Json } from "../store/canonical.ts";
import type { Commit, Read } from "../engine/engine.ts";
import type { Message, Reply, Request } from "../engine/protocol.ts";

// The interface's end of the one protocol: requests to the engine's thread,
// each answered once, and subscriptions answered again whenever what they
// read changes.

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

  private send(request: Request): Promise<Json> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.worker.postMessage({ id, ...request } satisfies Message);
    });
  }

  attach(key: string, url: string) {
    return this.send({ op: "attach", key, url });
  }

  read(read: Read) {
    return this.send({ op: "read", read });
  }

  commit(commit: Commit) {
    return this.send({ op: "commit", commit });
  }

  async subscribe(read: Read, listener: (value: Json) => void): Promise<{ value: Json; close: () => void }> {
    const id = this.next;
    this.listeners.set(id, listener);
    const { value } = (await this.send({ op: "subscribe", read })) as { subscription: number; value: Json };
    return {
      value,
      close: () => {
        this.listeners.delete(id);
        void this.send({ op: "unsubscribe", subscription: id });
      },
    };
  }
}
