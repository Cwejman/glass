// A storage in a browser. Blobs and the head are kept in OPFS, in a folder of the store's
// own, laid out as a folder on a machine is: blobs/ and head. A blob read is kept open, as
// a file is on a machine: in a worker, through a synchronous handle opened read-only, so
// any number of tabs and workers may hold one on the same blob; elsewhere, as the File
// read once. Blobs never change, so what is kept open always reads right. The browser
// keeps no page cache for OPFS; pool.ts stands in for one, over this storage.
//
// A store published with a site names where the site serves it. Its head is the one the
// site serves, and it is read here, never written. A blob it does not keep yet is fetched
// from the site once, served gzipped as the site's build writes it, unpacked, checked
// against its name, and kept. A blob a read waits on is fetched at once; blobs asked to be
// kept beforehand are fetched behind them, a few at a time, only while no read waits.
//
// The head of a store the reader writes, such as the home, is moved under a Web Lock,
// which every tab and worker of the site shares, and each move is told to the others on a
// BroadcastChannel.

import { Missing, nameOf, type Storage } from "./storage.ts";

// Where a store is kept: its folder in OPFS, and, for a store published with the site,
// the URL its blobs and head are served from, ending in a slash.
export type Kept = { folder: string; from?: string };

// A browser's storage, which can also be asked to keep blobs before any read needs them.
export type BrowserStorage = Storage & { keep(names: string[]): Promise<void> };

export async function browserStorage({ folder, from }: Kept): Promise<BrowserStorage> {
  const opfs = await navigator.storage.getDirectory();
  const glass = await opfs.getDirectoryHandle("glass", { create: true });
  const kept = await glass.getDirectoryHandle(folder, { create: true });
  const blobs = await kept.getDirectoryHandle("blobs", { create: true });
  const opened = new Map<string, Promise<Opened>>();

  return {
    put: (bytes) => put(blobs, bytes),
    read: (name, offset, length) => read(blobs, opened, from, name, offset, length),
    remove: (name) => remove(blobs, opened, name),
    head: () => head(kept, from),
    moveHead: (before, to) => moveHead(kept, folder, from, before, to),
    watchHead: (listener) => watchHead(folder, from, listener),
    keep: (names) => keep(blobs, from, names),
  };
}

type Folder = FileSystemDirectoryHandle;

async function put(blobs: Folder, bytes: Uint8Array) {
  const name = await nameOf(bytes);
  if (!(await fileIn(blobs, name))) await write(blobs, name, bytes);
  return name;
}

// From the blob kept open, else from OPFS, else, for a published store, fetched from the
// site and kept.
async function read(
  blobs: Folder,
  opened: Map<string, Promise<Opened>>,
  from: string | undefined,
  name: string,
  offset = 0,
  length?: number,
) {
  let open = opened.get(name);
  if (!open) {
    open = openBlob(blobs, from, name);
    opened.set(name, open);
    open.catch(() => opened.delete(name));
    if (opened.size > most) {
      const [first, oldest] = opened.entries().next().value!;
      opened.delete(first);
      void oldest.then(
        (each) => each.close(),
        () => {},
      );
    }
  }
  return (await open).read(offset, length);
}

async function remove(blobs: Folder, opened: Map<string, Promise<Opened>>, name: string) {
  const open = opened.get(name);
  opened.delete(name);
  await open?.then(
    (each) => each.close(),
    () => {},
  );
  await blobs.removeEntry(name).catch(() => {});
}

// A published store's head is read from the site once: it moves only when the site is
// published again.
const served = new Map<string, Promise<string | null>>();

async function head(kept: Folder, from: string | undefined) {
  if (from) {
    if (!served.has(from)) {
      const reading = fetch(`${from}head`, { cache: "no-store" }).then(async (answer) => {
        if (answer.status === 404) return null;
        if (!answer.ok) throw new Error(`the site did not serve the head of ${from}: ${answer.status}`);
        return (await answer.text()).trim() || null;
      });
      served.set(from, reading);
      reading.catch(() => served.delete(from));
    }
    return served.get(from)!;
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

// A blob kept open: read at an offset, and closed.
type Opened = { read(offset: number, length?: number): Uint8Array | Promise<Uint8Array>; close(): void };

// The most blobs kept open at once.
const most = 4096;

// A blob opened to be read: kept, or fetched first. In a worker, a synchronous handle read
// at an offset; where none can be had read-only, the File, sliced.
async function openBlob(blobs: Folder, from: string | undefined, name: string): Promise<Opened> {
  const handle = await blobs.getFileHandle(name).catch(async () => {
    if (!from) throw new Missing(name);
    await asked(() => fetched(blobs, from, name));
    return blobs.getFileHandle(name);
  });

  const access = await (
    handle as unknown as { createSyncAccessHandle(options: { mode: string }): Promise<SyncAccess> }
  )
    .createSyncAccessHandle({ mode: "read-only" })
    .catch(() => null);

  if (access) {
    const size = access.getSize();
    return {
      read: (offset, length) => {
        const bytes = new Uint8Array(Math.max(0, Math.min(length ?? size - offset, size - offset)));
        return bytes.subarray(0, access.read(bytes, { at: offset }));
      },
      close: () => access.close(),
    };
  }

  const file = await handle.getFile();
  return {
    read: async (offset, length) =>
      new Uint8Array(
        await file.slice(offset, length === undefined ? undefined : offset + length).arrayBuffer(),
      ),
    close: () => {},
  };
}

type SyncAccess = {
  getSize(): number;
  read(buffer: Uint8Array, options: { at: number }): number;
  close(): void;
};

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

// The blobs not kept yet fetched and kept, a few at a time, each waiting while a read
// waits on a fetch of its own.
async function keep(blobs: Folder, from: string | undefined, names: string[]) {
  if (!from) return;
  const together = 4;
  let next = 0;

  await Promise.all(
    Array.from({ length: together }, async () => {
      while (next < names.length) {
        const name = names[next++]!;
        if (
          await blobs.getFileHandle(name).then(
            () => true,
            () => false,
          )
        )
          continue;
        await quiet();
        await fetched(blobs, from, name);
      }
    }),
  );
}

// Fetches reads wait on, under way, in every store of the worker; and what waits for
// there to be none.
let waiting = 0;
const idle: (() => void)[] = [];

async function asked<T>(work: () => Promise<T>) {
  waiting++;
  try {
    return await work();
  } finally {
    if (--waiting === 0) for (const go of idle.splice(0)) go();
  }
}

const quiet = () => (waiting === 0 ? Promise.resolve() : new Promise<void>((go) => idle.push(go)));

// A blob fetched from the site, unpacked, checked against its name, and kept.
const fetching = new Map<string, Promise<void>>();

function fetched(blobs: Folder, from: string, name: string) {
  const known = fetching.get(name);
  if (known) return known;

  const loading = (async () => {
    const served = await fetch(`${from}blobs/${name}`);
    if (!served.ok) throw new Error(`the site did not serve the blob ${name}: ${served.status}`);

    const bytes = new Uint8Array(
      await new Response(served.body!.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer(),
    );
    if ((await nameOf(bytes)) !== name)
      throw new Error(`the blob ${name} the site served does not match its name`);

    await write(blobs, name, bytes);
  })();

  fetching.set(name, loading);
  loading.finally(() => fetching.delete(name)).catch(() => {});
  return loading;
}
