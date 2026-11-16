// Judging a change against the field as the stores stand: first that each head its at
// gives is one its store has had; then what the field knows of it, planned and held to
// the rules; and, where it is strict, that nothing it touches moved since its at. Every
// problem is found at once, and none is thrown.

import type { Head, Holon, Problem, Store } from "../../../stores/store.ts";
import type { Heads } from "../engine.ts";
import { fieldOf, type Field } from "../read/field.ts";
import { isHandle, type Change } from "./change.ts";
import { knownOf } from "./known.ts";
import { planOf, type Plan } from "./plan.ts";

// The stores a worker has mounted, by name, and whether it writes to each.
export type Mounted = ReadonlyMap<string, { store: Store; write: boolean }>;

export async function judge(change: Change, stores: Mounted, heads: Heads): Promise<Plan> {
  const now = fieldOf(stores, heads);
  const mounts = [...stores].map(([name, { write }]) => ({ name, write }));
  const [seen, plan] = await Promise.all([
    atProblems(change.at, stores, heads),
    knownOf(now, mounts, change).then((known) => planOf(known, change)),
  ]);

  const strict = change.strict && !seen.length ? await moved(change, now, fieldOf(stores, change.at)) : [];
  return { ...plan, problems: [...seen, ...plan.problems, ...strict] };
}

// The heads at gives that no mounted store has had.
async function atProblems(at: Heads, stores: Mounted, heads: Heads): Promise<Problem[]> {
  const found = await Promise.all(
    Object.entries(at).map(async ([name, head]): Promise<Problem | undefined> => {
      if (!head) return undefined;
      if (!stores.has(name)) return { rule: "at", says: `at gives a head of ${name}, which is not mounted` };

      const now = heads[name] as Head | null | undefined;
      const taken = now && (await stores.get(name)!.store.read(now, { act: head.act })).length;
      return taken ? undefined : { rule: "at", says: `at gives a head ${name} has never had` };
    }),
  );

  return found.filter((problem): problem is Problem => problem !== undefined);
}

// What the change touches that moved since its at: each holon it writes or takes out,
// read as it stood then and as it stands now.
async function moved(change: Change, now: Field, then: Field): Promise<Problem[]> {
  const ids = [...change.holons.map(({ id }) => id), ...(change.gone ?? [])].filter((id) => !isHandle(id));
  const read = (field: Field, id: string) => field.holon(id).then((kept) => text(kept?.holon));
  const found = await Promise.all(
    ids.map(async (id) => ((await read(then, id)) === (await read(now, id)) ? [] : [id])),
  );

  return found
    .flat()
    .map((id) => ({ rule: "strict", id, says: "it moved since the heads the change was made from" }));
}

const text = (holon: Holon | undefined) => (holon ? JSON.stringify(holon) : null);
