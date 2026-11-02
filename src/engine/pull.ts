import { HttpBackend } from "../store/backend.ts";
import type { Name } from "../store/name.ts";
import { Store } from "../store/store.ts";

// Pulling a store served as files. A first visit fetches the ref and, where
// the host offers one, a bundle of everything its commit reaches; every
// object in it is checked like any other. A bundle that does not check is
// set aside, and the loose objects, which are the truth, are fetched instead.

export async function pull(base: string): Promise<Store> {
  const backend = new HttpBackend(base);
  const store = new Store(backend);
  const head = await backend.ref("main");
  if (!head) return store;
  const text = await backend.bundle(head);
  if (!text) return store;
  try {
    const bundle = JSON.parse(text) as { kind: string; commit: Name; objects: Record<Name, unknown> };
    if (bundle.kind !== "bundle" || bundle.commit !== head) return store;
    const seeded = new Store(backend);
    for (const [name, object] of Object.entries(bundle.objects)) await seeded.seed(name as Name, object);
    return seeded;
  } catch {
    return store;
  }
}
