// A storage in a folder on a machine: each blob a file in blobs/, named by its hash, and
// the head a file holding one blob's name. Any number of processes may share the folder.
//
// A blob is written beside its place and renamed into it, so no reader sees half of one.
// A rename is not a compare-and-swap, so moving the head takes a lock file for the swap
// alone: compare the head, write the new one beside it, rename it into place, release.
// The lock holds its holder's process id; a lock left by a process that died is removed
// and taken. Two processes taking over the same dead lock at the same instant could both
// succeed; that needs a crash and a race together, and is left so for now.

import { mkdirSync, watch } from "node:fs";
import { open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nameOf, type Storage } from "./storage.ts";

export function folderStorage(folder: string): Storage {
  const blobs = join(folder, "blobs");
  const headFile = join(folder, "head");
  const lockFile = join(folder, "head.lock");
  mkdirSync(blobs, { recursive: true });

  async function put(bytes: Uint8Array) {
    const name = await nameOf(bytes);
    const path = join(blobs, name);
    if (await exists(path)) return name;

    const beside = `${path}.${process.pid}.${crypto.randomUUID()}`;
    await writeFile(beside, bytes);
    await rename(beside, path);
    return name;
  }

  async function read(name: string, offset = 0, length?: number) {
    const file = await open(join(blobs, name));

    try {
      const size = length ?? (await file.stat()).size - offset;
      const bytes = new Uint8Array(size);
      const { bytesRead } = await file.read(bytes, 0, size, offset);
      return bytes.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
  }

  async function remove(name: string) {
    await rm(join(blobs, name), { force: true });
  }

  async function head() {
    try {
      return (await readFile(headFile, "utf8")) || null;
    } catch (error) {
      if (codeOf(error) === "ENOENT") return null;
      throw error;
    }
  }

  async function moveHead(from: string | null, to: string) {
    const release = await lock();

    try {
      if ((await head()) !== from) return false;

      const beside = `${headFile}.${process.pid}`;
      await writeFile(beside, to);
      await rename(beside, headFile);
      return true;
    } finally {
      await release();
    }
  }

  // The listener is called when the head file is replaced, and only when the name it
  // holds differs from the last one seen, since a folder may report one change twice.
  function watchHead(listener: (head: string | null) => void) {
    let last: string | null | undefined;
    head().then((now) => (last ??= now));

    const watcher = watch(folder, async (_, file) => {
      if (file !== "head") return;
      const now = await head();
      if (now === last) return;
      last = now;
      listener(now);
    });

    return () => watcher.close();
  }

  // Takes the lock, waiting while a live process holds it. Returns the function that
  // releases it.
  async function lock(): Promise<() => Promise<void>> {
    try {
      await writeFile(lockFile, String(process.pid), { flag: "wx" });
      return () => rm(lockFile, { force: true });
    } catch (error) {
      if (codeOf(error) !== "EEXIST") throw error;

      if (await heldByTheLiving()) await pause(1);
      else await rm(lockFile, { force: true });

      return lock();
    }
  }

  async function heldByTheLiving() {
    const holder = Number(await readFile(lockFile, "utf8").catch(() => ""));
    if (!holder) return true;

    try {
      process.kill(holder, 0);
      return true;
    } catch {
      return false;
    }
  }

  return { put, read, remove, head, moveHead, watchHead };
}

const codeOf = (error: unknown) => (error as { code?: string }).code;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
