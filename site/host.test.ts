// The host on this machine, over stores in folders of the test's own: the page it serves
// names its engine, the socket answers only the page's own origin and never attaches,
// and a store written beside the engine is heard without anything polled.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { folderFiles } from "../integrations/glass/folder.ts";
import { commit, openStore } from "../integrations/glass/store.ts";
import type { Reply } from "../engine/serve/protocol.ts";
import { host } from "./host.ts";

const root = mkdtempSync(join(tmpdir(), "glass-host-"));
const folder = join(root, "notes", ".glass");
const site = join(root, "dist");
let hosted: Awaited<ReturnType<typeof host>>;
let noteId: string;

beforeAll(async () => {
  await Bun.write(join(site, "index.html"), '<html lang="en" data-site="site=./stores/site/"></html>');

  const notes = await openStore(folderFiles(folder));
  noteId = notes.minter()();
  await commit(notes, { holons: [{ id: noteId, instance: [], name: "first", body: {} }], says: "a note" });

  hosted = await host({ port: 0, stores: { notes: folder }, home: join(root, "home"), site });
});

afterAll(() => {
  hosted.stop();
  rmSync(root, { recursive: true, force: true });
});

// A socket to the host, saying an origin, and every reply it is sent.
async function socketFrom(origin: string) {
  const replies: Reply[] = [];
  const socket = new WebSocket(`${hosted.url.replace("http", "ws")}engine`, {
    headers: { Origin: origin },
  } as never);
  socket.onmessage = ({ data }) => replies.push(JSON.parse(String(data)));
  await new Promise((opened, failed) => {
    socket.onopen = opened;
    socket.onerror = failed;
  });

  const answered = async (count: number) => {
    for (let waited = 0; replies.length < count && waited < 3000; waited += 20) await Bun.sleep(20);
    return replies;
  };

  return { socket, replies, answered, send: (message: object) => socket.send(JSON.stringify(message)) };
}

test("the page the host serves names its engine", async () => {
  const page = await (await fetch(hosted.url)).text();
  expect(page).toContain('data-engine="/engine"');
});

test("a socket from any other origin is refused", async () => {
  const asked = await fetch(`${hosted.url}engine`, {
    headers: { Origin: "http://elsewhere.test", Upgrade: "websocket", Connection: "Upgrade" },
  });
  expect(asked.status).toBe(403);
});

test("the page's own socket reads the field, and is refused an attach in words", async () => {
  const { socket, answered, send } = await socketFrom(hosted.url.slice(0, -1));

  send({ id: 1, op: "read", read: { holon: noteId } });
  send({ id: 2, op: "attach", key: "elsewhere", url: "http://elsewhere.test/store/" });
  const replies = await answered(2);
  const byId = (id: number) => replies.find((reply) => "id" in reply && reply.id === id);
  const [read, attach] = [byId(1), byId(2)];

  expect((read as { value: { name: string } }).value.name).toBe("first");
  expect(attach).toEqual({ id: 2, ok: false, error: expect.stringContaining("attaches only") });
  socket.close();
});

test("a store written beside the engine is heard, and its subscribers told", async () => {
  const { socket, answered, send } = await socketFrom(hosted.url.slice(0, -1));

  send({ id: 1, op: "subscribe", read: { holon: noteId } });
  await answered(1);

  const beside = await openStore(folderFiles(folder));
  await commit(beside, {
    holons: [{ id: noteId, instance: [], name: "second", body: {} }],
    says: "said again",
  });

  const [, told] = await answered(2);
  expect(told).toEqual({ subscription: 1, value: expect.objectContaining({ name: "second" }) });
  socket.close();
});

test("a socket saying another host is refused, even from the page's own origin", async () => {
  const asked = await fetch(`${hosted.url}engine`, {
    headers: {
      Host: "glass.test",
      Origin: hosted.url.slice(0, -1),
      Upgrade: "websocket",
      Connection: "Upgrade",
    },
  });
  expect(asked.status).toBe(403);
});

test("what is no message is answered in words, and an op the engine has not is refused", async () => {
  const { socket, answered, send } = await socketFrom(hosted.url.slice(0, -1));

  socket.send("not a message");
  send({ id: 4, op: "dance" });
  const replies = await answered(2);

  expect(replies).toContainEqual({ id: 0, ok: false, error: expect.stringContaining("not a message") });
  expect(replies).toContainEqual({ id: 4, ok: false, error: expect.stringContaining("dance") });
  socket.close();
});

test("a second host is refused the home another holds", async () => {
  const again = host({ port: 0, stores: {}, home: join(root, "home"), site });
  await expect(again).rejects.toThrow(/another host holds/);
});

test("a store never yet written is hosted, and heard when it first is", async () => {
  const fresh = join(root, "fresh", ".glass");
  const second = await host({ port: 0, stores: { fresh }, home: join(root, "second home"), site });

  try {
    const store = await openStore(folderFiles(fresh));
    const id = store.minter()();
    await commit(store, { holons: [{ id, instance: [], name: "born", body: {} }], says: "the first" });

    let read: unknown = null;
    for (let waited = 0; !read && waited < 3000; waited += 20) {
      await Bun.sleep(20);
      read = await second.engine.read({ holon: id });
    }
    expect(read).toEqual(expect.objectContaining({ name: "born" }));
  } finally {
    second.stop();
  }
});

test("no store may be called home, which is the host's own", async () => {
  await expect(
    host({ port: 0, stores: { home: folder }, home: join(root, "third home"), site }),
  ).rejects.toThrow(/home is the host's own/);
});
