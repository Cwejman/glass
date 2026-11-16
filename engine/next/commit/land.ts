// Offering a judged change to the stores it touches: one commit, the same in every store,
// each store given its own share of it over the head it was judged against. Each store
// takes its share alone, so the change may land in one and not another; whoever
// committed is told where it landed, and what each other store answered.
//
// What every store keeps of the commit, its content, is what it says, when, by whom,
// the heads its maker had read of the stores it touches, what it takes out, and every
// store's share, each store named by the id of its root.

import { contentOf, hashOf, partOf } from "../../../stores/act.ts";
import type { Act, Head, Problem } from "../../../stores/store.ts";
import type { Heads } from "../engine.ts";
import type { Change } from "./change.ts";
import type { Mounted } from "./judge.ts";
import type { Plan } from "./plan.ts";
import { touchesOf } from "./touches.ts";

// Where a commit landed, by store, the ids its handles were given, and what each store
// it did not land in answered: refused, or changed since it was judged.
export type Landed = {
  landed: Record<string, Head>;
  ids: Record<string, string>;
  missed?: Record<string, { refused: Problem[] } | { changed: Head }>;
};

export async function land(
  plan: Plan,
  change: Change,
  stores: Mounted,
  heads: Heads,
): Promise<Landed | { changed: true }> {
  const parts = await Promise.all(
    plan.shares.map(async ({ root, holons }) => {
      const part = partOf(holons);
      return [root, part && (await hashOf(part))] as [string, string | null];
    }),
  );

  // What the maker had read of the stores the commit touches, and nothing of any other.
  const at = plan.shares.flatMap(({ store, root }) => {
    const head = change.at[store];
    return head ? [[root, head] as [string, Head]] : [];
  });

  const said = {
    when: new Date().toISOString(),
    says: change.says,
    ...(change.by !== undefined && { by: change.by }),
    at,
    gone: change.gone ?? [],
    parts,
  };
  const hash = await hashOf(contentOf(said));

  const replies = await Promise.all(
    plan.shares.map(({ store, root, holons, born }) =>
      stores.get(store)!.store.offer({
        ...said,
        hash,
        own: root,
        holons,
        born,
        over: (heads[store] as Head | null | undefined) ?? null,
        touches: touchesOf({ ...change, holons }),
      } satisfies Act),
    ),
  );

  const landed: Landed["landed"] = {};
  const missed: NonNullable<Landed["missed"]> = {};
  replies.forEach((reply, i) => {
    const { store } = plan.shares[i]!;
    if ("accepted" in reply) landed[store] = reply.accepted;
    else missed[store] = reply;
  });

  if (!Object.keys(landed).length && Object.values(missed).some((reply) => "changed" in reply))
    return { changed: true };
  return { landed, ids: plan.ids, ...(Object.keys(missed).length && { missed }) };
}
