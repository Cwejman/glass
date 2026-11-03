import type { Json } from "../store/canonical.ts";
import type { Name } from "../store/name.ts";
import type { Store } from "../store/store.ts";
import { fieldOf, judge, pastOf, read, standing, type Change, type Field, type Read } from "./field.ts";

export type { Change, FieldPlace, HolonRead, Read } from "./field.ts";
export type { Expression } from "./expression.ts";

// The engine holds the stores it attaches and is the only way into them. Its
// home is the one store it writes; every store it pulls is read, never
// written. What it keeps is the stores and the field as it stands now: it
// takes attaches and commits one at a time, each making the next field from
// the one before, and tells whoever listens that the field has changed.

export interface Engine {
  attach(key: string, store: Store): Promise<void>;
  read(query: Read): Promise<Json>;
  commit(change: Change): Promise<Name | undefined>;
  onChange(listener: () => void): () => void;
}

export async function startEngine(home: Store): Promise<Engine> {
  const stores = [{ key: "home", store: home }];
  let field: Field = fieldOf([await standing("home", home)]);
  let turn: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  const inTurn = <T>(act: () => Promise<T>): Promise<T> => {
    const taken = turn.then(act);
    turn = taken.catch(() => undefined);
    return taken;
  };
  const become = (next: Field) => {
    field = next;
    for (const listener of listeners) listener();
  };

  return {
    attach: (key, store) =>
      inTurn(async () => {
        if (stores.some((attached) => attached.key === key))
          throw new Error(`a store is already attached as ${key}`);
        const next = fieldOf([...field.stores, await standing(key, store)]);
        stores.push({ key, store });
        become(next);
      }),

    read: (query) => read(field, pastOf(stores), query),

    commit: (change) =>
      inTurn(async () => {
        const problem = await judge(field, pastOf(stores), change);
        if (problem) throw new Error(problem);
        const name = await home.write({ ...change, at: new Date().toISOString() });
        if (name) become(fieldOf([await standing("home", home), ...field.stores.slice(1)]));
        return name;
      }),

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
