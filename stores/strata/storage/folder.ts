// A storage in a folder on a machine: each blob a file in blobs/, named by its hash, and
// the head a file holding a short text. Any number of processes may share the folder.
//
// A blob is written beside its place and renamed into it, so no reader sees half of one.
// A rename is not a compare-and-swap, so moving the head takes a lock file for the swap
// alone: compare the head, write the new one beside it, rename it into place, release.
// The lock holds its holder's process id; a lock left by a process that died is removed
// and taken. Two processes taking over the same dead lock at the same instant could both
// succeed; that needs a crash and a race together, and is left so for now.
//
// A blob read is kept open, and read again at an offset through the same file
// descriptor, the number the system gives a file opened, so a read is one call to the
// system rather than open, read and close. Blobs never change, so what an open file reads
// is always right, and on macOS and Linux a blob removed while open stays readable through
// it. Up to a few thousand are kept open, the first opened closed first; the system's page
// cache keeps their bytes, not this.

import { closeSync, fstatSync, mkdirSync, openSync, readSync, watch } from "node:fs";
import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Missing, nameOf, type Storage } from "./storage.ts";

// The storage's methods, over the folder given.
export function folderStorage(folder: string): Storage {
  mkdirSync(join(folder, "blobs"), { recursive: true });
  const opened = new Map<string, number>();

  return {
    put: (bytes) => put(folder, bytes),
    read: async (name, offset, length) => read(folder, opened, name, offset, length),
    remove: (name) => remove(folder, opened, name),
    head: () => head(folder),
    moveHead: (from, to) => moveHead(folder, from, to),
    watchHead: (listener) => watchHead(folder, listener),
  };
}

const blobAt = (folder: string, name: string) => join(folder, "blobs", name);
const headFile = (folder: string) => join(folder, "head");
const lockFile = (folder: string) => join(folder, "head.lock");

async function put(folder: string, bytes: Uint8Array) {
  const name = await nameOf(bytes);
  const path = blobAt(folder, name);
  if (await exists(path)) return name;

  const beside = `${path}.${process.pid}.${crypto.randomUUID()}`;
  await writeFile(beside, bytes);
  await rename(beside, path);
  return name;
}

// The most blobs kept open at once.
const most = 4096;

function read(folder: string, opened: Map<string, number>, name: string, offset = 0, length?: number) {
  let file = opened.get(name);
  if (file === undefined) {
    try {
      file = openSync(blobAt(folder, name), "r");
    } catch (error) {
      throw (error as { code?: string }).code === "ENOENT" ? new Missing(name) : error;
    }
    opened.set(name, file);
    if (opened.size > most) {
      const [first, descriptor] = opened.entries().next().value!;
      opened.delete(first);
      closeSync(descriptor);
    }
  }

  const size = length ?? fstatSync(file).size - offset;
  const bytes = new Uint8Array(size);
  return bytes.subarray(0, readSync(file, bytes, 0, size, offset));
}

async function remove(folder: string, opened: Map<string, number>, name: string) {
  const file = opened.get(name);
  if (file !== undefined) {
    opened.delete(name);
    closeSync(file);
  }
  await rm(blobAt(folder, name), { force: true });
}

async function head(folder: string) {
  try {
    return (await readFile(headFile(folder), "utf8")) || null;
  } catch (error) {
    if (codeOf(error) === "ENOENT") return null;
    throw error;
  }
}

async function moveHead(folder: string, from: string | null, to: string) {
  const release = await lock(folder);

  try {
    if ((await head(folder)) !== from) return false;

    const beside = `${headFile(folder)}.${process.pid}`;
    await writeFile(beside, to);
    await rename(beside, headFile(folder));
    return true;
  } finally {
    await release();
  }
}

// The listener is called when the head file is replaced, and only when the name it holds
// differs from the last one seen, since a folder may report one change twice.
function watchHead(folder: string, listener: (head: string | null) => void) {
  let last: string | null | undefined;
  head(folder).then((now) => (last ??= now));

  const watcher = watch(folder, async (_, file) => {
    if (file !== "head") return;
    const now = await head(folder);
    if (now === last) return;
    last = now;
    listener(now);
  });

  return () => watcher.close();
}

// Takes the lock, waiting while a live process holds it. Returns the function that
// releases it.
async function lock(folder: string): Promise<() => Promise<void>> {
  try {
    await writeFile(lockFile(folder), String(process.pid), { flag: "wx" });
    return () => rm(lockFile(folder), { force: true });
  } catch (error) {
    if (codeOf(error) !== "EEXIST") throw error;

    if (await heldByTheLiving(folder)) await pause(1);
    else await rm(lockFile(folder), { force: true });

    return lock(folder);
  }
}

async function heldByTheLiving(folder: string) {
  const holder = Number(await readFile(lockFile(folder), "utf8").catch(() => ""));
  if (!holder) return true;

  try {
    process.kill(holder, 0);
    return true;
  } catch {
    return false;
  }
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const codeOf = (error: unknown) => (error as { code?: string }).code;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
