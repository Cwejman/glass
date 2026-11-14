import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sameThread, workers } from "../runtime/runtime.ts";
import { thing } from "./fixtures/thing.ts";
import { portChannel } from "./port.ts";
import { connect, host } from "./socket.ts";
import { anotherConnectionTo, disconnect, disconnected, objectServedOn, serveObject } from "./wire.ts";

type Thing = ReturnType<typeof thing>;

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

// An object served on one end of a channel, and its proxy at the other.
function overPort(served: object = thing()) {
  const { port1, port2 } = new MessageChannel();
  serveObject(portChannel(port2), served);
  return objectServedOn<Thing>(portChannel(port1));
}

const folder = mkdtempSync(join(tmpdir(), "glass-wire-"));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

// The same object, served in each way it can be: over a port, at an address, and run on
// a worker.
const ways: [string, () => Promise<Thing>][] = [
  ["over a port", async () => overPort()],
  [
    "at an address",
    async () => {
      const address = join(folder, `${Math.random()}.sock`);
      host(address, thing());
      return connect<Thing>(address);
    },
  ],
  ["on a worker", () => workers().run<Thing>(new URL("./fixtures/thing.ts", import.meta.url))],
];

for (const [way, reached] of ways)
  describe(way, () => {
    test("a method is answered, and its bytes travel as bytes", async () => {
      const it = await reached();
      const answer = await it.echo({ holon: "x" }, new Uint8Array([1, 2, 3]));

      expect(answer.value).toEqual({ holon: "x" });
      expect(answer.bytes).toBeInstanceOf(Uint8Array);
      expect([...answer.bytes!]).toEqual([3, 2, 1]);
      disconnect(it);
    });

    test("a failure is answered as its problem", async () => {
      const it = await reached();
      await expect(it.fail()).rejects.toThrow("it failed");
      disconnect(it);
    });

    test("a listener is told until it is stopped", async () => {
      const it = await reached();
      const told: number[] = [];

      const stop = await it.count((n) => told.push(n));
      await settle();
      expect(told).toEqual([1, 2, 3]);

      stop();
      await settle();
      expect(await it.stops()).toBe(1);
      disconnect(it);
    });

    test("another connection is independent of the first", async () => {
      const it = await reached();
      const second = await anotherConnectionTo(it);

      disconnect(it);
      await disconnected(it);
      expect((await second.echo("still")).value).toBe("still");
      disconnect(second);
    });

    test("once closed, it says it has stopped", async () => {
      const it = await reached();
      disconnect(it);
      await disconnected(it);
      await expect(it.echo(1)).rejects.toThrow("it has stopped");
    });
  });

describe("a thing handed on", () => {
  test("over a port, its port goes with it, and the giver can no longer speak to it", async () => {
    const store = overPort();
    const engine = overPort();

    expect((await engine.use(store, "through")).value).toBe("through");
    await expect(store.echo(1)).rejects.toThrow("it was handed on");
  });

  test("at an address, the address goes with it, and it is connected to from there", async () => {
    const storeAt = join(folder, "store.sock");
    const engineAt = join(folder, "engine.sock");
    host(storeAt, thing());
    host(engineAt, thing());

    const engine = connect<Thing>(engineAt);
    expect((await engine.use(connect<Thing>(storeAt), "through")).value).toBe("through");
    disconnect(engine);
  });

  test("from workers, one worker speaks to the other directly", async () => {
    const runtime = workers();
    const module = new URL("./fixtures/thing.ts", import.meta.url);
    const [store, engine] = await Promise.all([runtime.run<Thing>(module), runtime.run<Thing>(module)]);

    expect((await engine.use(store, "through")).value).toBe("through");
    disconnect(engine);
  });
});

test("a module that fails to start is refused with its problem", async () => {
  await expect(workers().run(new URL("./fixtures/missing.ts", import.meta.url))).rejects.toThrow();
});

describe("in the same thread", () => {
  test("a module runs here, and its object is used as it is", async () => {
    const it = await sameThread().run<Thing>(new URL("./fixtures/thing.ts", import.meta.url));

    expect((await it.echo("here")).value).toBe("here");
    expect(await anotherConnectionTo(it)).toBe(it);
  });
});
