// A reader evaluates expressions against the stores it has connections to. The engine
// runs several on its readers runtime, one per thread, so reads run in parallel, and a
// slow or failing read holds up only the reader it runs on.

import type { Expression } from "../../language/expression.ts";
import type { Store } from "../../stores/store.ts";
import { disconnect } from "../../wire/wire.ts";
import type { Answer, Heads } from "./engine.ts";
import { evaluate } from "./read/evaluate.ts";

export type Reader = {
  mount(name: string, store: Store): Promise<void>;
  unmount(name: string): Promise<void>;
  // Evaluates the expression against each store at the head given for it. The answer
  // carries the heads of the stores it read.
  read(expression: Expression, heads: Heads): Promise<Answer>;
};

export function reader(): Reader {
  const stores = new Map<string, Store>();

  async function mount(name: string, store: Store) {
    stores.set(name, store);
  }

  async function unmount(name: string) {
    const store = stores.get(name);
    stores.delete(name);
    if (store) disconnect(store);
  }

  async function read(expression: Expression, heads: Heads): Promise<Answer> {
    try {
      const { value, asked } = await evaluate(expression, stores, heads);
      return { at: Object.fromEntries(asked.map((name: string) => [name, heads[name]!])), value };
    } catch (problem) {
      return { at: heads, problem: String(problem) };
    }
  }

  return { mount, unmount, read };
}

export default () => reader();
