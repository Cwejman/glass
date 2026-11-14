// What is read and parsed from a blob, kept by the blob's name and offset. Blobs never
// change once written, and are named by the hash of their bytes, so what is kept is never
// stale, in any storage. The most recent 20,000 are kept.

const kept = new Map<string, Promise<unknown>>();
const most = 20_000;

export function remembered<T>(key: string, load: () => Promise<T>): Promise<T> {
  const known = kept.get(key);
  if (known) {
    kept.delete(key);
    kept.set(key, known);
    return known as Promise<T>;
  }

  const loading = load();
  kept.set(key, loading);
  loading.catch(() => kept.delete(key));
  if (kept.size > most) kept.delete(kept.keys().next().value!);

  return loading;
}
