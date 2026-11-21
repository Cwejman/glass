// A worker does the engine's work over the stores it has connections to: it reads, and it
// takes a commit through judging, minting and offering. The engine runs several on the
// runtime it is given, every one the same, one per thread, so a slow or failing read or
// commit holds up only the worker it runs on.

import type { Store } from "../stores/store.ts";
import { disconnect } from "../wire/wire.ts";
import type { Answer, Committed, Heads, Read } from "./engine.ts";
import { evaluate } from "./read/evaluate.ts";
import type { Change } from "./commit/change.ts";
import { judge } from "./commit/judge.ts";
import { land } from "./commit/land.ts";

export type EngineWorker = {
  mount(name: string, store: Store, as: { write: boolean }): Promise<void>;
  unmount(name: string): Promise<void>;
  // Works the read out over each store at the head given for it. The answer carries the
  // heads of the stores it read.
  read(read: Read, heads: Heads): Promise<Answer>;
  // Judges the change against each store at the head given for it, minting its ids;
  // refused, returns its problems; else offers it to every store it touches, judging it
  // again, up to three times, at the heads the stores answer with where what it touches
  // has changed. Gives too every set of heads it judged at, so the engine knows which
  // heads its commit was laid over.
  commit(change: Change, heads: Heads): Promise<{ committed: Committed; judgedAt: Heads[] }>;
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

  async function read(read: Read, heads: Heads): Promise<Answer> {
    const { asked, ...answer } = await evaluate(read, stores, heads);
    return { at: Object.fromEntries(asked.map((name: string) => [name, heads[name] ?? null])), ...answer };
  }

  async function commit(change: Change, heads: Heads) {
    const judgedAt: Heads[] = [heads];

    for (let tries = 1; ; tries++) {
      const at = judgedAt.at(-1)!;
      const plan = await judge(change, stores, at);
      if (plan.problems.length) return { committed: { refused: plan.problems }, judgedAt };

      const landed = await land(plan, change, stores, at);
      if (!("changed" in landed)) return { committed: landed, judgedAt };
      if (tries === 3) {
        const says = "what the change touches kept changing while it was judged";
        return { committed: { refused: [{ rule: "changed", says }] }, judgedAt };
      }

      judgedAt.push({ ...at, ...landed.changed });
    }
  }

  return { mount, unmount, read, commit };
}

export default () => engineWorker();
