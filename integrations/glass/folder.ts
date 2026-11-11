// A folder on this machine as the files a store is kept in. Apart from files.ts,
// since the browser has no folders and its bundle must not reach for them.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    write: async (path, content) => writeFileSync(at(path), content),
    append: async (path, text) => appendFileSync(at(path), text),
  };
}
