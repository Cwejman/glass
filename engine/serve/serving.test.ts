// The engine's end of the protocol, over an engine whose reads are given and whose
// changes are made by hand: each message answered once, each subscription told again
// only when what it reads has changed, and told when it can no longer be read.

import { expect, test } from "bun:test";
import type { Engine } from "../compat.ts";
import type { Reply } from "./protocol.ts";
import { serving } from "./serving.ts";

// An engine that reads by the function given, and changes when told to.
function engineOf(read: (query: unknown) => unknown) {
  const heard = new Set<() => void>();
  const engine = {
    read: async (query: unknown) => read(query),
    commit: async () => ({ commit: "made", ids: {} }),
    onChange(listener: () => void) {
      heard.add(listener);
      return () => heard.delete(listener);
    },
  } as unknown as Engine;

  return { engine, change: () => heard.forEach((listener) => listener()) };
}

// A serving and everything it has sent.
function served(read: (query: unknown) => unknown) {
  const { engine, change } = engineOf(read);
  const sent: Reply[] = [];
  const attached: string[] = [];
  const serve = serving(engine, {
    attach: async (key, url) => void attached.push(`${key} ${url}`),
    send: (reply) => sent.push(reply),
  });

  return { serve, sent, attached, change, settled: () => new Promise((done) => setTimeout(done, 0)) };
}

test("each message is answered once, by its id", async () => {
  const { serve, sent, attached } = served(() => "the value");

  await serve.receive({ id: 1, op: "read", read: { holon: "a" } });
  await serve.receive({ id: 2, op: "commit", change: { holons: [] } });
  await serve.receive({ id: 3, op: "attach", key: "site", url: "./stores/site/" });

  expect(sent).toEqual([
    { id: 1, ok: true, value: "the value" },
    { id: 2, ok: true, value: { commit: "made", ids: {} } },
    { id: 3, ok: true, value: null },
  ]);
  expect(attached).toEqual(["site ./stores/site/"]);
});

test("what fails is answered in words, not as a value", async () => {
  const { serve, sent } = served(() => {
    throw new Error("there is no holon a");
  });

  await serve.receive({ id: 1, op: "read", read: { holon: "a" } });

  expect(sent).toEqual([{ id: 1, ok: false, error: "there is no holon a" }]);
});

test("a subscription is told again only when what it reads has changed", async () => {
  let value = "first";
  const { serve, sent, change, settled } = served(() => value);

  await serve.receive({ id: 7, op: "subscribe", read: { holon: "a" } });
  change();
  await settled();
  value = "second";
  change();
  await settled();

  expect(sent).toEqual([
    { id: 7, ok: true, value: { subscription: 7, value: "first" } },
    { subscription: 7, value: "second" },
  ]);
});

test("a subscription that can no longer be read is told so", async () => {
  let readable = true;
  const { serve, sent, change, settled } = served(() => {
    if (!readable) throw new Error("the store holding a is gone");
    return "first";
  });

  await serve.receive({ id: 7, op: "subscribe", read: { holon: "a" } });
  readable = false;
  change();
  await settled();

  expect(sent.at(-1)).toEqual({ subscription: 7, error: "the store holding a is gone" });
});

test("nothing more is told after unsubscribing, or once closed", async () => {
  let value = 0;
  const { serve, sent, change, settled } = served(() => value);

  await serve.receive({ id: 1, op: "subscribe", read: { holon: "a" } });
  await serve.receive({ id: 2, op: "subscribe", read: { holon: "b" } });
  await serve.receive({ id: 3, op: "unsubscribe", subscription: 1 });
  value = 1;
  change();
  await settled();

  expect(sent.filter((reply) => "subscription" in reply && !("id" in reply))).toEqual([
    { subscription: 2, value: 1 },
  ]);

  serve.close();
  value = 2;
  change();
  await settled();

  expect(sent.filter((reply) => "subscription" in reply && !("id" in reply))).toHaveLength(1);
});

test("a change while a subscription first reads is read again, so it starts from now", async () => {
  let reads = 0;
  let change = () => undefined as void;
  const fresh = served(() => {
    reads++;
    if (reads === 1) change();
    return reads;
  });
  change = fresh.change;

  await fresh.serve.receive({ id: 1, op: "subscribe", read: { holon: "a" } });

  expect(fresh.sent[0]).toEqual({ id: 1, ok: true, value: { subscription: 1, value: 2 } });
});

test("a subscription that comes back to what it was before failing is told so", async () => {
  let readable = true;
  const { serve, sent, change, settled } = served(() => {
    if (!readable) throw new Error("the store holding a is gone");
    return "first";
  });

  await serve.receive({ id: 7, op: "subscribe", read: { holon: "a" } });
  readable = false;
  change();
  await settled();
  readable = true;
  change();
  await settled();

  expect(sent.slice(1)).toEqual([
    { subscription: 7, error: "the store holding a is gone" },
    { subscription: 7, value: "first" },
  ]);
});

test("a read overtaken by a later change is never told, however late it comes", async () => {
  const pending: ((value: string) => void)[] = [];
  const { engine, change } = engineOf(() => undefined);
  const sent: Reply[] = [];
  engine.read = (() => new Promise<string>((done) => pending.push(done))) as Engine["read"];
  const serve = serving(engine, { attach: async () => undefined, send: (reply) => sent.push(reply) });

  const subscribed = serve.receive({ id: 1, op: "subscribe", read: { holon: "a" } });
  pending.shift()!("first");
  await subscribed;

  change();
  change();
  const [older, newer] = pending.splice(0);
  newer!("newer");
  await new Promise((done) => setTimeout(done, 0));
  older!("older");
  await new Promise((done) => setTimeout(done, 0));

  expect(sent.slice(1)).toEqual([{ subscription: 1, value: "newer" }]);
});
