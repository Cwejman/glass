// What is read and parsed from a blob, kept by the blob's name and offset. Blobs never
// change once written, and are named by the hash of their bytes, so what is kept is never
// stale, in any storage. Each is weighed by the size of the bytes it was read from, and
// up to 128 MB of them are kept; what is parsed from them takes a few times that.
//
// The cache is two maps, recent and older. What is read goes into the recent one, and
// what is found in the older one is moved into the recent one. Once the recent one
// holds half the budget, the older one is dropped whole and the recent one becomes the
// older. Nothing is deleted one by one and nothing is searched for, since a Map slows
// down with every entry deleted from it, and a cache asked hundreds of thousands of times
// cannot pay that.

type Kept = { value: Promise<unknown>; size: number };

const half = 64 * 1024 * 1024;
let recent = new Map<string, Kept>();
let older = new Map<string, Kept>();
let held = 0;

export function remembered<T>(key: string, size: number, load: () => Promise<T>): Promise<T> {
  const known = recent.get(key) ?? older.get(key);
  if (known) {
    if (!recent.has(key)) keep(key, known);
    return known.value as Promise<T>;
  }

  const value = load();
  keep(key, { value, size });
  value.catch(() => recent.delete(key) && older.delete(key));
  return value;
}

function keep(key: string, kept: Kept) {
  recent.set(key, kept);
  held += kept.size;
  if (held < half) return;

  older = recent;
  recent = new Map();
  held = 0;
}
