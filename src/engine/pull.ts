import { servedBackend } from "../store/backend.ts";
import type { Name } from "../store/name.ts";
import { openStore, type Store } from "../store/store.ts";

// Pulling a store served as files. A first visit fetches the ref and, where
// the host offers one, a bundle of everything its commit reaches; every
// object in it is checked like any other. A bundle that does not check is
// set aside, and the loose objects, which are the truth, are fetched instead.

export async function pull(base: string): Promise<Store> {
  const backend = servedBackend(base);
  const head = await backend.ref("main");
  const text = head && (await backend.bundle(head));
  if (!head || !text) return openStore(backend);
  try {
    const bundle = JSON.parse(text) as { kind: string; commit: Name; objects: Record<Name, unknown> };
    if (bundle.kind !== "bundle" || bundle.commit !== head) return openStore(backend);
    const store = openStore(backend);
    for (const [name, object] of Object.entries(bundle.objects)) await store.seed(name as Name, object);
    return store;
  } catch {
    return openStore(backend);
  }
}
