// The compactor: strata's housekeeping as a program of its own, beside the store, on a
// thread of its own. It compacts whenever the head moves, so the store's thread serves
// reads and offers with nothing else to do. It keeps one piece of state, since it is a
// running program: whether it is compacting, so a move heard meanwhile is taken up when
// it finishes rather than started twice.

import { compact } from "./compact.ts";
import type { Storage } from "./storage/storage.ts";

export function compactor(storage: Storage) {
  let compacting = false;
  let again = false;

  async function wake() {
    if (compacting) {
      again = true;
      return;
    }

    compacting = true;
    do {
      again = false;
      await compact(storage).catch(() => {});
    } while (again);
    compacting = false;
  }

  const unwatch = storage.watchHead(() => void wake());
  void wake();

  return { stop: async () => unwatch() };
}
