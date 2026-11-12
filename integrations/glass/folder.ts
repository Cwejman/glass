// A folder on this machine as the files a store is kept in. Apart from files.ts,
// since the browser has no folders and its bundle must not reach for them.
//
// Everything written is synced before it is said to be, so the ref, replaced last, never
// names what the disk lacks. A file is replaced by writing its text beside it and
// renaming that over it, which is whole or not at all.

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { Files } from "./files.ts";

export function folderFiles(dir: string): Files {
  const at = (path: string) => {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    return full;
  };

  return {
    read: async (path) =>
      existsSync(join(dir, path)) ? new Uint8Array(readFileSync(join(dir, path))) : null,
    write: async (path, content) => synced(at(path), "w", content),
    append: async (path, text) => synced(at(path), "a", text),

    async replace(path, text) {
      const full = at(path);
      const beside = `${full}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`;

      try {
        synced(beside, "w", text);
        renameSync(beside, full);
      } finally {
        rmSync(beside, { force: true });
      }

      syncFolder(dirname(full));
    },

    lock: async () => lockAt(join(dir, "lock")),
  };
}

function synced(path: string, flag: "w" | "a" | "wx", content: string | Uint8Array) {
  const fd = openSync(path, flag);

  try {
    writeFileSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

// A rename lasts once its folder is synced. Where a folder cannot be opened to sync, as
// on Windows, the rename stands as the system keeps it.
function syncFolder(folder: string) {
  try {
    const fd = openSync(folder, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {}
}

// ---- Locks

// A lock is a file made exclusively, naming the process holding it and when it began.
// One whose process no longer runs is stale, left by a crash: it is taken out and the
// lock made again, once; a writer that then finds it made by another is refused. Two
// writers taking one stale lock at the same instant could both hold it: a crash and such
// a race at once are left. A lock that cannot be read is never taken, but said, to be
// removed by hand; and one whose process id the system has given again stays held, the
// refusal naming it and when it began, so it can be seen.
export function lockAt(path: string) {
  mkdirSync(dirname(path), { recursive: true });

  const mine = JSON.stringify({ pid: process.pid, began: new Date().toISOString() });
  const made = () => {
    try {
      synced(path, "wx", mine);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
  };

  if (!made()) {
    const holder = holderOf(path);

    if (holder?.running) throw new Error(`${path} is locked by process ${holder.pid}, since ${holder.began}`);
    if (!holder && existsSync(path))
      throw new Error(`${path} cannot be read: remove it if nothing writes here`);

    rmSync(path, { force: true });
    if (!made()) throw new Error(`${path} was locked by another process as it was taken`);
  }

  // Let go only if it is still this lock.
  return async () => {
    if (existsSync(path) && readFileSync(path, "utf8") === mine) rmSync(path, { force: true });
  };
}

// A lock written before 2026-11-12, the host's, is its process id alone.
function holderOf(path: string) {
  try {
    const said = JSON.parse(readFileSync(path, "utf8"));
    const { pid, began } = typeof said === "number" ? { pid: said, began: "a time unsaid" } : said;
    if (!Number.isInteger(pid)) return undefined;

    return { pid: pid as number, began: String(began), running: running(pid) };
  } catch {
    return undefined;
  }
}

// Whether a process runs: one that runs as another user refuses the signal, and is.
function running(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
