// A run: index entries sorted by key, written once as one blob in binary, and read in
// place, a block at a time. Every entry is stamped with the number of the act that wrote
// it, so one run answers for every head: as of act n, a key's value is its newest entry
// stamped n or lower. Nothing in a run is parsed to find the way through it; keys are
// compared as bytes.
//
// Each act writes one run of its own entries. Merging runs writes one run holding all
// their entries, so the runs merged can be removed: history is kept in the stamps, not in
// copies.
//
// The blob is the entries, in blocks of 32, then an index of where each block begins and
// its first key. Sorted keys share long beginnings, so each entry keeps only what its key
// does not share with the key before it in its block; the first entry of a block keeps
// its key whole.
//
//   entry   u16 bytes shared, u16 bytes not shared, those bytes, u32 act,
//           u8 kind (0 removed, 1 set), u16 value length, value
//   index   for each block: u32 offset, u16 key length, key; then u32 where the entries end

import { remembered } from "./remembered.ts";
import type { Storage } from "./storage/storage.ts";

// Where a run is: its blob, how many entries it holds, and where its index lies. A run
// written by an act, before the act's number is known, gives its entries no stamp; the
// root that lays it says the act's number, and that stands for every entry.
export type Run = { blob: string; count: number; index: [offset: number, length: number]; act?: number };

// An entry: its key as bytes, the act it was written by, and its value, or null where the
// act removed the key.
export type Entry = { key: Uint8Array; act: number; value: Uint8Array | null };

export type Written = { bytes: Uint8Array; count: number; index: [offset: number, length: number] };

const block = 32;

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
  const cursors = await Promise.all(
    runs.map(async (run) => cursorOver(await storage.read(run.blob, 0, run.index[0]), run.act)),
  );
  const run = writer();

  for (;;) {
    let next: Cursor | null = null;
    for (const cursor of cursors) if (!cursor.ended && (!next || compareKeys(cursor, next) < 0)) next = cursor;
    if (!next) break;

    run.add(entryAt(next));
    step(next);
  }

  return run.done();
}

// Entries added in order, written into blocks, with the index after them.
function writer() {
  let bytes = new Uint8Array(1 << 16);
  let view = new DataView(bytes.buffer);
  let at = 0;
  let count = 0;
  let previous: Uint8Array = new Uint8Array(0);
  const starts: number[] = [];
  const firsts: Uint8Array[] = [];

  function room(more: number) {
    if (at + more <= bytes.length) return;
    const larger = new Uint8Array(Math.max(bytes.length * 2, at + more));
    larger.set(bytes.subarray(0, at));
    [bytes, view] = [larger, new DataView(larger.buffer)];
  }

  function add({ key, act, value }: Entry) {
    if (count++ % block === 0) {
      starts.push(at);
      firsts.push(key);
      previous = new Uint8Array(0);
    }

    const shared = sharedLength(previous, key);
    const rest = key.length - shared;
    room(4 + rest + 7 + (value?.length ?? 0));

    view.setUint16(at, shared);
    view.setUint16(at + 2, rest);
    bytes.set(key.subarray(shared), at + 4);
    at += 4 + rest;
    view.setUint32(at, act);
    view.setUint8(at + 4, value ? 1 : 0);
    view.setUint16(at + 5, value?.length ?? 0);
    if (value) bytes.set(value, at + 7);
    at += 7 + (value?.length ?? 0);
    previous = key;
  }

  function done(): Written {
    const end = at;
    room(firsts.reduce((sum, key) => sum + 6 + key.length, 0) + 4);

    for (const [i, key] of firsts.entries()) {
      view.setUint32(at, starts[i]!);
      view.setUint16(at + 4, key.length);
      bytes.set(key, at + 6);
      at += 6 + key.length;
    }
    view.setUint32(at, end);
    at += 4;

    return { bytes: bytes.slice(0, at), count, index: [end, at - end] };
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

// Calls each with a cursor at every entry from the block that may hold `key` onward, in
// order, until it returns false or the run ends.
async function visit(storage: Storage, run: Run, key: Uint8Array, each: (cursor: Cursor) => boolean) {
  const index = await indexOf(storage, run);
  let low = 0;
  let high = index.firsts.length;

  // The first block whose first key is at or after the key; the key's newest entries may
  // begin in the block before it.
  while (low < high) {
    const middle = (low + high) >> 1;
    if (compare(index.firsts[middle]!, key) < 0) low = middle + 1;
    else high = middle;
  }

  for (let at = Math.max(0, low - 1); at < index.starts.length; at++) {
    const cursor = cursorOver(await blockOf(storage, run, index, at), run.act);
    for (; !cursor.ended; step(cursor)) if (!each(cursor)) return;
  }
}

// A place in a run's entries, and the entry there, decoded in place: its key made whole
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
    view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    next: 0,
    stamp,
    ended: false,
    key: new Uint8Array(256),
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
  if (shared + rest > cursor.key.length) {
    const larger = new Uint8Array(Math.max(cursor.key.length * 2, shared + rest));
    larger.set(cursor.key.subarray(0, shared));
    cursor.key = larger;
  }
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

type Index = { starts: number[]; firsts: Uint8Array[]; end: number };

// A run's index, read once and kept: runs never change.
function indexOf(storage: Storage, run: Run): Promise<Index> {
  const [offset, length] = run.index;

  return remembered(`index ${run.blob}`, length, async () => {
    const bytes = await storage.read(run.blob, offset, length);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const index: Index = { starts: [], firsts: [], end: view.getUint32(length - 4) };

    for (let at = 0; at < length - 4; ) {
      index.starts.push(view.getUint32(at));
      const keyLength = view.getUint16(at + 4);
      index.firsts.push(bytes.slice(at + 6, at + 6 + keyLength));
      at += 6 + keyLength;
    }

    return index;
  });
}

function blockOf(storage: Storage, run: Run, index: Index, at: number): Promise<Uint8Array> {
  const start = index.starts[at]!;
  const end = index.starts[at + 1] ?? index.end;
  return remembered(`block ${run.blob} ${at}`, end - start, () => storage.read(run.blob, start, end - start));
}

// ---- Keys

// Keys compared byte by byte, as they are sorted.
export function compare(a: Uint8Array, b: Uint8Array) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}
