// The host on this machine, over a store in a folder of the test's own: it serves the
// built page as it is, and the store live as the page reads it, a head read fresh and a
// blob gzipped, so a commit beside the host is served at once, and nothing else of the
// store's folder.

import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contentOf, hashOf, partOf } from "../stores/act.ts";
import type { Act, Head, Holon } from "../stores/store.ts";
import { folderStorages } from "../stores/strata/storage/folder.ts";
import { strata } from "../stores/strata/strata.ts";
import { host } from "./host.ts";

const root = mkdtempSync(join(tmpdir(), "glass-host-"));
const folder = join(root, "notes", ".glass");
const site = join(root, "dist");
const store = strata(folderStorages(folder));
let head: Head | null = null;
let hosted: ReturnType<typeof host>;

// A commit of the holons given, as the engine offers one.
async function committed(holons: Holon[], says: string) {
  const part = partOf(holons);
  const said = {
    when: new Date().toISOString(),
    says,
    at: [],
    gone: [],
    parts: [["R", part && (await hashOf(part))]] as Act["parts"],
  };
  const reply = await store.offer({
    ...said,
    hash: await hashOf(contentOf(said)),
    own: "R",
    holons,
    born: holons.map(({ id }) => id),
    over: head,
    touches: { ids: holons.map(({ id }) => id), addresses: [] },
  });
  if (!("accepted" in reply)) throw new Error(JSON.stringify(reply));
  head = reply.accepted;
}

beforeAll(async () => {
  await Bun.write(join(site, "index.html"), '<html lang="en"></html>');
  await Bun.write(join(site, "404.html"), '<html lang="en"></html>');
  await committed([{ id: "1M75HB35AC75004", instance: [], name: "notes", body: {} }], "a note");
  hosted = host({ port: 0, stores: { notes: folder }, site });
});

afterAll(() => {
  hosted.stop();
  rmSync(root, { recursive: true, force: true });
});

test("the page is served as it is", async () => {
  expect(await (await fetch(hosted.url)).text()).toBe('<html lang="en"></html>');
});

test("a store's head is served as its folder keeps it, and moves with a commit beside the host", async () => {
  const before = await (await fetch(`${hosted.url}strata/notes/head`)).text();
  expect(before).toBe(head!.commit);

  await committed([{ id: "1M75HB35AC75005", instance: [], name: "second", body: {} }], "another");
  expect(await (await fetch(`${hosted.url}strata/notes/head`)).text()).toBe(head!.commit);
});

test("a blob is served gzipped, as the page unpacks it", async () => {
  const served = await fetch(`${hosted.url}strata/notes/blobs/${head!.commit}`);
  const bytes = Bun.gunzipSync(new Uint8Array(await served.arrayBuffer()));
  expect(await hashOf(bytes)).toBe(head!.commit);
});

test("the index is served within, at index/", async () => {
  const [run] = readdirSync(join(folder, "index", "blobs"));
  expect((await fetch(`${hosted.url}strata/notes/index/head`)).status).toBe(200);
  expect((await fetch(`${hosted.url}strata/notes/index/blobs/${run}`)).status).toBe(200);
});

test("nothing else of a store's folder is served, nor a store not hosted", async () => {
  expect((await fetch(`${hosted.url}strata/notes/blobs/not-a-blob`)).status).toBe(404);
  expect((await fetch(`${hosted.url}strata/notes/index/blobs/x/y`)).status).toBe(404);
  expect((await fetch(`${hosted.url}strata/elsewhere/head`)).status).toBe(404);
});

test("a path holding nothing is served the page, as 404.html, so the page opens at any path", async () => {
  const served = await fetch(`${hosted.url}some/where/deep`);
  expect(served.status).toBe(404);
  expect(served.headers.get("content-type")).toContain("text/html");
  expect(await served.text()).toBe('<html lang="en"></html>');
});
