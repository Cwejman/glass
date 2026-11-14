// Whether anything an act touches changed between the head it was judged against and the
// head it is now to be laid over: walking back from the newer head, each root's act is
// compared with this one's. A head that is not found in that history counts as changed.

import type { Head, Touches } from "../store.ts";
import { rootAt } from "./root.ts";
import type { Storage } from "./storage/storage.ts";

export async function changedSince(storage: Storage, over: Head | null, at: Head | null, touches: Touches) {
  let name = at?.page ?? null;

  while (name !== null && name !== (over?.page ?? null)) {
    const root = await rootAt(storage, name);
    if (meet(root.touches, touches)) return true;
    name = root.previous;
  }

  return name !== (over?.page ?? null);
}

function meet(a: Touches, b: Touches) {
  const ids = new Set(a.ids);
  const addresses = new Set(a.addresses.map((address) => JSON.stringify(address)));
  return (
    b.ids.some((id) => ids.has(id)) || b.addresses.some((address) => addresses.has(JSON.stringify(address)))
  );
}
