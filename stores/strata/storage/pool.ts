// A pool of pages in memory over a storage, standing in for the page cache a machine's
// system keeps and a browser does not: reads at an offset are answered by whole pages of
// 4 KB, the unit a run is laid in, each read from the storage once and kept, by blob and
// page, up to a budget. Blobs never change, so a page kept is never stale. A blob read
// whole is passed through, not kept.
//
// Pages are kept in two maps, recent and older. A page read goes into the recent one, and
// one found in the older one is moved there; once the recent one holds half the budget,
// the older one is dropped whole. Nothing is deleted one by one, since a Map slows down
// with every entry deleted from it.

import type { Storage } from "./storage.ts";

const page = 4096;

export function pooled(storage: Storage, budget = 64 * 1024 * 1024): Storage {
  let recent = new Map<string, Uint8Array>();
  let older = new Map<string, Uint8Array>();
  let held = 0;

  function keep(key: string, bytes: Uint8Array) {
    recent.set(key, bytes);
    held += bytes.length;
    if (held < budget / 2) return;
    older = recent;
    recent = new Map();
    held = 0;
  }

  function kept(key: string) {
    const known = recent.get(key) ?? older.get(key);
    if (known && !recent.has(key)) keep(key, known);
    return known;
  }

  // The pages from first to last, those not kept read from the storage in one read for
  // each stretch of them, and kept.
  async function pages(name: string, first: number, last: number) {
    const found: Uint8Array[] = [];

    for (let number = first; number <= last; ) {
      const known = kept(`${name} ${number}`);
      if (known) {
        found.push(known);
        number++;
        continue;
      }

      let end = number;
      while (end < last && !kept(`${name} ${end + 1}`)) end++;
      const bytes = await storage.read(name, number * page, (end - number + 1) * page);
      for (let at = 0; number <= end; at += page, number++) {
        const one = bytes.slice(at, at + page);
        keep(`${name} ${number}`, one);
        found.push(one);
      }
    }

    return found;
  }

  async function read(name: string, offset = 0, length?: number) {
    if (length === undefined) return storage.read(name, offset);

    const first = Math.floor(offset / page);
    const found = await pages(name, first, Math.floor((offset + Math.max(length, 1) - 1) / page));
    const bytes = new Uint8Array(length);
    let filled = 0;
    for (const [i, each] of found.entries()) {
      const start = i === 0 ? offset - first * page : 0;
      const part = each.subarray(start, Math.min(each.length, start + length - filled));
      bytes.set(part, filled);
      filled += part.length;
    }
    return bytes.subarray(0, filled);
  }

  return { ...storage, read };
}
