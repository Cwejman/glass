// What is read and parsed from a blob, kept by the blob's name and offset. Blobs never
// change once written, and are named by the hash of their bytes, so what is kept is never
// stale, in any storage. Each is kept by the size of the bytes it was read from, and the
// most recently used are kept up to 64 MB of them; what is parsed from them takes a few
// times that in memory.

const kept = new Map<string, { value: Promise<unknown>; size: number }>();
const budget = 64 * 1024 * 1024;
let held = 0;

export function remembered<T>(key: string, size: number, load: () => Promise<T>): Promise<T> {
  const known = kept.get(key);
  if (known) {
    kept.delete(key);
    kept.set(key, known);
    return known.value as Promise<T>;
  }

  const value = load();
  kept.set(key, { value, size });
  held += size;
  value.catch(() => forget(key));

  for (const [oldest] of kept) {
    if (held <= budget) break;
    forget(oldest);
  }

  return value;
}

function forget(key: string) {
  const known = kept.get(key);
  if (!known) return;
  kept.delete(key);
  held -= known.size;
}
