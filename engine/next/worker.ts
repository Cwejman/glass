// A worker does the engine's work over the stores it has connections to: it reads, and it
// takes a commit through judging, minting and offering. The engine runs several on the
// runtime it is given, every one the same, one per thread, so a slow or failing read or
// commit holds up only the worker it runs on.

import type { Expression } from "../../language/expression.ts";
import type { Head, Store } from "../../stores/store.ts";
import { disconnect } from "../../wire/wire.ts";
import type { Answer, Committed, Heads } from "./engine.ts";
import { evaluate } from "./read/evaluate.ts";
import type { Change } from "./commit/change.ts";
import { judge } from "./commit/judge.ts";
import { land } from "./commit/land.ts";

export type EngineWorker = {
  mount(name: string, store: Store, as: { write: boolean }): Promise<void>;
  unmount(name: string): Promise<void>;
  // Works the expression out over each store at the head given for it. The answer
  // carries the heads of the stores it read.
  read(expression: Expression, heads: Heads): Promise<Answer>;
  // Judges the change against each store at the head given for it, minting its ids;
  // refused, returns its problems; else offers it to every store it touches, judging it
  // again, up to three times, where the stores answer that what it touches has changed.
  commit(change: Change, heads: Heads): Promise<Committed>;
};

type Mounted = { store: Store; write: boolean };

export function engineWorker(): EngineWorker {
  const stores = new Map<string, Mounted>();

  async function mount(name: string, store: Store, { write }: { write: boolean }) {
    stores.set(name, { store, write });
  }

  async function unmount(name: string) {
    const mounted = stores.get(name);
    stores.delete(name);
    if (mounted) disconnect(mounted.store);
  }

  async function read(expression: Expression, heads: Heads): Promise<Answer> {
    try {
      const { value, asked } = await evaluate(expression, stores, heads);
      return { at: Object.fromEntries(asked.map((name: string) => [name, heads[name]!])), value };
    } catch (problem) {
      return { at: heads, problem: String(problem) };
    }
  }

  async function commit(change: Change, heads: Heads): Promise<Committed> {
    let judgedAt = heads;

    for (let tries = 1; ; tries++) {
      const plan = await judge(change, stores, judgedAt);
      if (plan.problems.length) return { refused: plan.problems };

      const landed = await land(plan, change, stores, judgedAt);
      if (!("changed" in landed)) return landed;
      if (tries === 3)
        return {
          refused: [{ rule: "changed", says: "what the change touches kept changing while it was judged" }],
        };

      judgedAt = await headsNow();
    }
  }

  // Every store's head as it stands now, as each store tells it.
  async function headsNow(): Promise<Heads> {
    const found = await Promise.all(
      [...stores].map(async ([name, { store }]) => {
        const { promise, resolve } = Promise.withResolvers<Head | null>();
        const unsubscribe = await store.subscribe(resolve);
        const head = await promise;
        unsubscribe();
        return [name, head] as const;
      }),
    );
    return Object.fromEntries(found);
  }

  return { mount, unmount, read, commit };
}

export default () => engineWorker();
