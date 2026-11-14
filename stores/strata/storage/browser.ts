// A storage in a browser. Blobs and the head are kept in OPFS, in a folder of the store's
// own, laid out as a folder on a machine is: blobs/ and head. Blobs read are held in
// memory up to a budget, shared by every store in the worker, so a page read twice is
// read from memory: the browser has no page cache of its own to do it.
//
// A store published with a site names where the site serves it. Its head is the one the
// site serves, and it is read here, never written. A blob it does not keep yet is fetched
// from the site once, checked against its name, and kept.
//
// The head of a store the reader writes, such as the home, is moved under a Web Lock,
// which every tab and worker of the site shares, and each move is told to the others on a
// BroadcastChannel.

import { nameOf, type Storage } from "./storage.ts";

// Where a store is kept: its folder in OPFS, and, for a store published with the site,
// the URL its blobs and head are served from, ending in a slash.
export type Kept = { folder: string; from?: string };

export async function browserStorage({ folder, from }: Kept): Promise<Storage> {
  const opfs = await navigator.storage.getDirectory();
  const glass = await opfs.getDirectoryHandle("glass", { create: true });
  const kept = await glass.getDirectoryHandle(folder, { create: true });
  const blobs = await kept.getDirectoryHandle("blobs", { create: true });

  return {
    put: (bytes) => put(blobs, bytes),
    read: (name, offset, length) => read(blobs, from, name, offset, length),
    remove: (name) => remove(blobs, name),
    head: () => head(kept, from),
    moveHead: (before, to) => moveHead(kept, folder, from, before, to),
    watchHead: (listener) => watchHead(folder, from, listener),
  };
}

type Folder = FileSystemDirectoryHandle;

async function put(blobs: Folder, bytes: Uint8Array) {
  const name = await nameOf(bytes);
  if (!(await fileIn(blobs, name))) await write(blobs, name, bytes);
  return name;
}

// From memory, else from OPFS, else, for a published store, fetched from the site.
async function read(blobs: Folder, from: string | undefined, name: string, offset = 0, length?: number) {
  const key = `${name} ${offset} ${length ?? ""}`;
  const pooled = pooledBytes(key);
  if (pooled) return pooled.slice();

  const file = (await fileIn(blobs, name)) ?? (from ? await fetched(blobs, from, name) : null);
  if (!file) throw new Error(`the blob ${name} is not kept here`);

  const end = length === undefined ? undefined : offset + length;
  const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
  return remembered(key, bytes).slice();
}

async function remove(blobs: Folder, name: string) {
  await blobs.removeEntry(name).catch(() => {});
}

async function head(kept: Folder, from: string | undefined) {
  if (from) {
    const served = await fetch(`${from}head`, { cache: "no-store" });
    if (served.status === 404) return null;
    if (!served.ok) throw new Error(`the site did not serve the head of ${from}: ${served.status}`);
    return (await served.text()).trim() || null;
  }

  const file = await fileIn(kept, "head");
  return file ? (await file.text()) || null : null;
}

async function moveHead(
  kept: Folder,
  folder: string,
  from: string | undefined,
  before: string | null,
  to: string,
) {
  if (from) throw new Error(`the store published at ${from} is read here, not written`);

  return navigator.locks.request(`glass ${folder} head`, async () => {
    if ((await head(kept, undefined)) !== before) return false;

    await write(kept, "head", new TextEncoder().encode(to));
    new BroadcastChannel(`glass ${folder} head`).postMessage(to);
    return true;
  });
}

// A published store's head moves only when the site is published again, so it is not
// watched.
function watchHead(folder: string, from: string | undefined, listener: (head: string | null) => void) {
  if (from) return () => {};

  const channel = new BroadcastChannel(`glass ${folder} head`);
  channel.onmessage = ({ data }) => listener(data as string);
  return () => channel.close();
}

// ---- OPFS

async function fileIn(folder: Folder, name: string) {
  try {
    return await (await folder.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

// A file written whole before anyone can read it under its name: createWritable writes
// beside it and swaps it in on close; where only a synchronous handle is offered, as in
// some browsers' workers, the bytes are written under another name and moved into place.
async function write(folder: Folder, name: string, bytes: Uint8Array) {
  if ("createWritable" in FileSystemFileHandle.prototype) {
    const writable = await (await folder.getFileHandle(name, { create: true })).createWritable();
    await writable.write(bytes as BufferSource);
    await writable.close();
    return;
  }

  const beside = await folder.getFileHandle(`${name}.${crypto.randomUUID()}`, { create: true });
  const access = await beside.createSyncAccessHandle();
  try {
    access.write(bytes as BufferSource, { at: 0 });
    access.flush();
  } finally {
    access.close();
  }
  await (beside as unknown as { move(name: string): Promise<void> }).move(name);
}

// A blob fetched from the site, checked against its name, and kept.
const fetching = new Map<string, Promise<File>>();

function fetched(blobs: Folder, from: string, name: string) {
  const known = fetching.get(name);
  if (known) return known;

  const loading = (async () => {
    const served = await fetch(`${from}blobs/${name}`);
    if (!served.ok) throw new Error(`the site did not serve the blob ${name}: ${served.status}`);

    const bytes = new Uint8Array(await served.arrayBuffer());
    if ((await nameOf(bytes)) !== name)
      throw new Error(`the blob ${name} the site served does not match its name`);

    await write(blobs, name, bytes);
    return (await fileIn(blobs, name))!;
  })();

  fetching.set(name, loading);
  loading.finally(() => fetching.delete(name)).catch(() => {});
  return loading;
}

// ---- Memory

// Bytes read, by blob, offset and length, about 64 MB of the most recently read kept, in
// two maps: what is read goes into the recent one, and what is found in the older one is
// moved there; once the recent one holds half, the older one is dropped whole. Nothing is
// deleted one by one, since a Map slows down with every entry deleted from it. What is
// handed out is a copy, since bytes sent over a wire are given up.
const half = 32 * 1024 * 1024;
let recent = new Map<string, Uint8Array>();
let older = new Map<string, Uint8Array>();
let pooled = 0;

function pooledBytes(key: string) {
  const known = recent.get(key) ?? older.get(key);
  if (known && !recent.has(key)) remembered(key, known);
  return known;
}

function remembered(key: string, bytes: Uint8Array) {
  recent.set(key, bytes);
  pooled += bytes.length;
  if (pooled < half) return bytes;

  older = recent;
  recent = new Map();
  pooled = 0;
  return bytes;
}
