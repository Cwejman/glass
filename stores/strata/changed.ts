// Whether anything an act touches changed between the head it was judged against and the
// head it is now to be laid over. The runs are the record of what every act changed: a
// holon it touches changed if its id has an entry stamped after the head it was judged
// against, and an address if it has one. A head the store never had counts as changed.

import type { Act } from "../store.ts";
import { keyOf } from "./entries.ts";
import { commitAt, type State } from "./head.ts";
import { stamps } from "./read.ts";
import type { Storages } from "./storage/storage.ts";

export async function changedSince(storages: Storages, { over, touches }: Act, now: State | null) {
  if ((over?.commit ?? null) === (now?.commit ?? null)) return false;
  if (!now) return true;

  const view = { runs: now.runs, upTo: (await commitAt(storages.history, now.commit)).number };
  const after = over
    ? await commitAt(storages.history, over.commit).then(
        ({ number }) => number,
        () => null,
      )
    : 0;
  if (after === null) return true;
  if (over && !(await stamps(storages, view, "acts", keyOf([over.act]))).some(({ act }) => act === after))
    return true;

  const keys = [
    ...touches.ids.map((id) => ["ids", keyOf([id])] as const),
    ...touches.addresses.map((address) => ["addresses", keyOf(address)] as const),
  ];
  for (const [tree, key] of keys)
    if ((await stamps(storages, view, tree, key)).some(({ act }) => act > after)) return true;

  return false;
}
