// What a commit does to the stores, the engine's one effect. A change is planned first,
// purely, by act.ts; here the plan is written, as one act in every store it touches,
// by glass's format. Before any of that, an act some earlier writer cut short is
// settled: finished where every store it names stands ready, taken out where none moved,
// and otherwise its stores refuse writes until they are attached.

import {
  act,
  drop,
  finish,
  idAt,
  openStore,
  type Pending,
  type Store,
} from "../../integrations/glass/store.ts";
import { factsOf, planOf, type Change, type Plan, type Problem } from "./act.ts";
import { isWritable, withStores, type Field } from "./field.ts";

export type Committed = { commit: string; ids: Record<string, string> };

// The plan of a change over the field as it stands: its ids minted from after the
// latest any store written has given.
export async function planIn(field: Field, change: Change): Promise<Plan> {
  const start = field.stores
    .filter(isWritable)
    .map(({ store }) => store.minter()())
    .sort()
    .at(-1);

  return planOf(await factsOf(field, change), change, start ?? idAt(Date.now()));
}

// A change refused: said by its first problem, the holon by its name where it has one,
// and carrying every problem found.
export function refusal(problems: readonly Problem[], { holons }: Change) {
  const said = ({ id, says }: Problem) =>
    id === undefined ? says : `${holons.find((holon) => holon.id === id)?.name ?? id}: ${says}`;

  return Object.assign(new Error(said(problems[0]!)), { problems });
}

export type Settled = { field: Field; waiting: ReadonlyMap<string, string> };

// Every act waiting past a written store's ref, settled as far as the stores attached
// allow; what cannot be settled leaves its stores refusing writes, and says why.
export async function settled(field: Field): Promise<Settled> {
  const writable = new Map(field.stores.filter(isWritable).map(({ key, store }) => [key, store]));
  const acts = new Map<string, Pending>();

  for (const store of writable.values()) {
    const pending = await store.pending();
    if (pending) acts.set(pending.act, pending);
  }

  const now = new Map<string, Store>();
  const waiting = new Map<string, string>();

  for (const { act: hash, says, stores: names } of acts.values()) {
    const absent = names.filter((name) => !writable.has(name));
    if (absent.length) {
      for (const name of names)
        waiting.set(name, `the act ${hash} ("${says}") was cut short, and waits on ${absent.join(", ")} to be attached and written`);
      continue;
    }

    const stands = await Promise.all(names.map((name) => writable.get(name)!.toward(hash)));
    const behind = names.filter((_, i) => stands[i] === "pending");

    if (stands.every((stand) => stand === "head" || stand === "pending"))
      for (const name of behind) now.set(name, await finish(writable.get(name)!));
    else if (stands.every((stand) => stand === "pending" || stand === "nowhere"))
      for (const name of behind) now.set(name, await drop(writable.get(name)!));
    else {
      const moved = names.filter((_, i) => stands[i] === "earlier" || stands[i] === "nowhere");
      for (const name of behind) waiting.set(name, `the act ${hash} ("${says}") was cut short, and ${moved.join(", ")} moved since`);
    }
  }

  return { field: now.size ? withStores(field, now) : field, waiting };
}

export type Written = { field: Field } & ({ committed: Committed } | { failed: unknown });

// A plan written: the next field, and what the commit did. Where the act fails, the
// stores whose head moved meanwhile are taken as they now stand, and the failure kept.
export async function write(field: Field, plan: Plan, change: Change): Promise<Written> {
  try {
    const done = await act(
      plan.stores.map(({ key, ...share }) => ({ name: key, ...share })),
      { says: change.says ?? "A change", born: plan.born },
    );

    return {
      field: withStores(field, new Map(plan.stores.map(({ key }, i) => [key, done.stores[i]!]))),
      committed: { commit: done.act, ids: plan.ids },
    };
  } catch (failed) {
    const moved = await movedStores(plan.stores);
    return { field: moved.size ? withStores(field, moved) : field, failed };
  }
}

// The stores whose head moved since they were opened, each as it now stands.
async function movedStores(targets: readonly { key: string; store: Store }[]) {
  const now = await Promise.all(
    targets.map(async ({ key, store }) => [key, await openStore(store.files, store.blocks).catch(() => store), store] as const),
  );

  return new Map(now.filter(([, reopened, was]) => reopened.head !== was.head).map(([key, reopened]) => [key, reopened]));
}
