// A run: index entries sorted by key, written once as one blob in binary, and read in
// place a page at a time, keeping nothing between reads. Every entry is stamped with the
// number of the act that wrote it, so one run answers for every head: as of act n, a
// key's value is its newest entry stamped n or lower. Keys are compared as bytes.
//
// Each act writes one run of its own entries. Merging runs writes one run holding all
// their entries, so the runs merged can be removed: history is kept in the stamps, not in
// copies.
//
// The blob is pages of 4 KB, laid as a tree. First the leaves, holding the entries in
// order; then the branches, each naming the pages below it by their first keys; the last
// page is the root, where every lookup begins, reaching a leaf in one read per level.
// Sorted keys share long beginnings, so an entry in a leaf keeps only what its key does
// not share with the key before it; the first entry of a leaf keeps its key whole.
//
//   page    u16 bytes used, u8 level (0 a leaf), then its entries or its children
//   entry   u16 bytes shared, u16 bytes not shared, those bytes, u32 act,
//           u8 kind (0 removed, 1 set), u16 value length, value
//   child   u16 key length, the first key of the page below, u32 that page's number

import type { Storage } from "./storage/storage.ts";

// Where a run is: its blob, how many entries it holds, and where its root page lies. A
// run written by an act, before the act's number is known, gives its entries no stamp;
// the head that lays it says the act's number, and that stands for every entry.
export type Run = { blob: string; count: number; index: [offset: number, length: number]; act?: number };

// An entry: its key as bytes, the act it was written by, and its value, or null where the
// act removed the key.
export type Entry = { key: Uint8Array; act: number; value: Uint8Array | null };

export type Written = { bytes: Uint8Array; count: number; index: [offset: number, length: number] };

const size = 4096;
const top = 3;

// ---- Writing

// A run's bytes from entries sorted by key, and the newest first within a key.
export function runOf(entries: Entry[]): Written {
  const run = writer();
  for (const entry of entries) run.add(entry);
  return run.done();
}

// The runs, newest first, as one run holding every entry of each, stamped with its act.
// Of two entries with one key, the newer run's comes first, its acts being later.
export async function mergedRuns(storage: Storage, runs: Run[]): Promise<Written> {
  const readers = await Promise.all(
    runs.map(async (run) => leavesOf(await storage.read(run.blob, 0, run.index[0]), run.act)),
  );
  const run = writer();

  for (;;) {
    let next: Leaves | null = null;
    for (const reader of readers)
      if (!reader.ended && (!next || compareKeys(reader.cursor, next.cursor) < 0)) next = reader;
    if (!next) break;

    run.add(entryAt(next.cursor));
    stepLeaves(next);
  }

  return run.done();
}

// Entries added in order, written into leaves, with the branches after them.
function writer() {
  const pages: Uint8Array[] = [];
  const firsts: Uint8Array[] = [];
  let page = new Uint8Array(size);
  let view = new DataView(page.buffer);
  let at = top;
  let count = 0;
  let previous: Uint8Array = new Uint8Array(0);

  function close(level: number) {
    view.setUint16(0, at);
    page[2] = level;
    pages.push(page);
    page = new Uint8Array(size);
    view = new DataView(page.buffer);
    at = top;
    previous = new Uint8Array(0);
  }

  function add({ key, act, value }: Entry) {
    const length = 4 + key.length + 7 + (value?.length ?? 0);
    if (top + length > size) throw new Error("an entry longer than a run's page can hold");

    let shared = sharedLength(previous, key);
    if (at + length - shared > size) {
      close(0);
      shared = 0;
    }
    if (at === top) firsts.push(key);

    const rest = key.length - shared;
    view.setUint16(at, shared);
    view.setUint16(at + 2, rest);
    page.set(key.subarray(shared), at + 4);
    at += 4 + rest;
    view.setUint32(at, act);
    view.setUint8(at + 4, value ? 1 : 0);
    view.setUint16(at + 5, value?.length ?? 0);
    if (value) page.set(value, at + 7);
    at += 7 + (value?.length ?? 0);
    previous = key;
    count++;
  }

  // The branches over the pages of one level, a level at a time, up to the one root.
  function done(): Written {
    if (!count) firsts.push(new Uint8Array(0));
    if (at > top || !pages.length) close(0);

    let below = firsts.map((key, number) => ({ key, number }));
    for (let level = 1; ; level++) {
      const above: typeof below = [];
      for (const { key, number } of below) {
        if (at + 6 + key.length > size) close(level);
        if (at === top) above.push({ key, number: pages.length });
        view.setUint16(at, key.length);
        page.set(key, at + 2);
        view.setUint32(at + 2 + key.length, number);
        at += 6 + key.length;
      }
      close(level);
      if (above.length === 1) break;
      below = above;
    }

    const bytes = new Uint8Array(pages.length * size);
    pages.forEach((each, i) => bytes.set(each, i * size));
    return { bytes, count, index: [(pages.length - 1) * size, size] };
  }

  return { add, done };
}

function sharedLength(a: Uint8Array, b: Uint8Array) {
  const most = Math.min(a.length, b.length, 0xffff);
  let i = 0;
  while (i < most && a[i] === b[i]) i++;
  return i;
}

// ---- Reading

// A key's value as of an act: from the newest entry stamped at or before it. Null where
// that entry removed the key, undefined where the run has no such entry.
export async function valueIn(storage: Storage, run: Run, key: Uint8Array, upTo: number) {
  let found: Uint8Array | null | undefined;

  await visit(storage, run, key, (cursor) => {
    const order = compareKey(cursor, key);
    if (order === 0 && cursor.act <= upTo) found = cursor.set ? valueAt(cursor) : null;
    return order < 0 || (order === 0 && cursor.act > upTo);
  });

  return found;
}

// Every key from `from` up to but not including `to`, each with its value as of an act,
// null where it was removed, in order.
export async function valuesIn(storage: Storage, run: Run, from: Uint8Array, to: Uint8Array, upTo: number) {
  const found: [Uint8Array, Uint8Array | null][] = [];

  await visit(storage, run, from, (cursor) => {
    if (compareKey(cursor, to) >= 0) return false;
    if (compareKey(cursor, from) < 0 || cursor.act > upTo) return true;
    const last = found.at(-1)?.[0];
    if (last && compareKey(cursor, last) === 0) return true;
    found.push([cursor.key.slice(0, cursor.keyLength), cursor.set ? valueAt(cursor) : null]);
    return true;
  });

  return found;
}

// Every entry for a key stamped at or before an act, newest first, each with its act and
// its value, null where that act removed the key.
export async function entriesFor(storage: Storage, run: Run, key: Uint8Array, upTo: number) {
  const found: { act: number; value: Uint8Array | null }[] = [];

  await visit(storage, run, key, (cursor) => {
    const order = compareKey(cursor, key);
    if (order === 0 && cursor.act <= upTo)
      found.push({ act: cursor.act, value: cursor.set ? valueAt(cursor) : null });
    return order <= 0;
  });

  return found;
}

// Calls each with a cursor at every entry from the leaf that may hold `key` onward, in
// order, until it returns false or the leaves end. The leaf is found from the root, one
// page per level: at each branch, the last page whose first key is below the key, since
// the key's newest entries may begin in the page before the one its key begins.
async function visit(storage: Storage, run: Run, key: Uint8Array, each: (cursor: Cursor) => boolean) {
  let number = run.index[0] / size;
  let page = await pageOf(storage, run, number);

  while (page[2] !== 0) {
    const view = viewOf(page);
    const used = view.getUint16(0);
    let below = -1;
    for (let at = top; at < used; ) {
      const length = view.getUint16(at);
      const first = page.subarray(at + 2, at + 2 + length);
      if (below >= 0 && compare(first, key) >= 0) break;
      below = view.getUint32(at + 2 + length);
      at += 6 + length;
    }
    number = below;
    page = await pageOf(storage, run, number);
  }

  for (; page[2] === 0; page = await pageOf(storage, run, ++number)) {
    const cursor = cursorOver(entriesIn(page), run.act);
    for (; !cursor.ended; step(cursor)) if (!each(cursor)) return;
  }
}

const pageOf = (storage: Storage, run: Run, number: number) => storage.read(run.blob, number * size, size);

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// A page's entries, as the bytes it uses after its header.
const entriesIn = (page: Uint8Array) => page.subarray(top, viewOf(page).getUint16(0));

// A run's leaves read in order, from all its pages up to its first branch.
type Leaves = {
  bytes: Uint8Array;
  number: number;
  stamp: number | undefined;
  cursor: Cursor;
  ended: boolean;
};

function leavesOf(bytes: Uint8Array, stamp: number | undefined): Leaves {
  const leaves = {
    bytes,
    number: 0,
    stamp,
    cursor: cursorOver(entriesIn(bytes.subarray(0, size)), stamp),
    ended: false,
  };
  if (leaves.cursor.ended) stepLeaves(leaves);
  return leaves;
}

function stepLeaves(leaves: Leaves) {
  if (!leaves.cursor.ended) step(leaves.cursor);

  while (leaves.cursor.ended) {
    const at = ++leaves.number * size;
    if (at >= leaves.bytes.length || leaves.bytes[at + 2] !== 0) {
      leaves.ended = true;
      return;
    }
    leaves.cursor = cursorOver(entriesIn(leaves.bytes.subarray(at, at + size)), leaves.stamp);
  }
}

// A place in a leaf's entries, and the entry there, decoded in place: its key made whole
// from the key before it, in a buffer used again for the next.
type Cursor = {
  bytes: Uint8Array;
  view: DataView;
  next: number;
  stamp: number | undefined;
  ended: boolean;
  key: Uint8Array;
  keyLength: number;
  act: number;
  set: boolean;
  value: [offset: number, length: number];
};

function cursorOver(bytes: Uint8Array, stamp: number | undefined): Cursor {
  const cursor: Cursor = {
    bytes,
    view: viewOf(bytes),
    next: 0,
    stamp,
    ended: false,
    key: new Uint8Array(size),
    keyLength: 0,
    act: 0,
    set: false,
    value: [0, 0],
  };
  step(cursor);
  return cursor;
}

function step(cursor: Cursor) {
  const { bytes, view, next: at } = cursor;
  if (at >= bytes.length) {
    cursor.ended = true;
    return;
  }

  const shared = view.getUint16(at);
  const rest = view.getUint16(at + 2);
  for (let i = 0; i < rest; i++) cursor.key[shared + i] = bytes[at + 4 + i]!;
  cursor.keyLength = shared + rest;

  const after = at + 4 + rest;
  cursor.act = cursor.stamp ?? view.getUint32(after);
  cursor.set = bytes[after + 4] === 1;
  cursor.value = [after + 7, view.getUint16(after + 5)];
  cursor.next = after + 7 + cursor.value[1];
}

const valueAt = ({ bytes, value: [offset, length] }: Cursor) => bytes.slice(offset, offset + length);

const entryAt = (cursor: Cursor): Entry => ({
  key: cursor.key.slice(0, cursor.keyLength),
  act: cursor.act,
  value: cursor.set ? valueAt(cursor) : null,
});

function compareKey({ key, keyLength }: Cursor, other: Uint8Array) {
  const length = Math.min(keyLength, other.length);
  for (let i = 0; i < length; i++) if (key[i] !== other[i]) return key[i]! - other[i]!;
  return keyLength - other.length;
}

function compareKeys(a: Cursor, b: Cursor) {
  const length = Math.min(a.keyLength, b.keyLength);
  for (let i = 0; i < length; i++) if (a.key[i] !== b.key[i]) return a.key[i]! - b.key[i]!;
  return a.keyLength - b.keyLength;
}

// ---- Keys

// Keys compared byte by byte, as they are sorted.
export function compare(a: Uint8Array, b: Uint8Array) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}
