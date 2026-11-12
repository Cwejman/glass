// The engine holds the stores it attaches and is the only way into them. It keeps no
// store of its own: it starts from the attachments it is given, each saying whether it
// may be written, and takes attaches and commits one at a time, each making the next
// field from the one before, and tells whoever listens that the field has changed.
//
// A commit is one act, written to every store it touches. Which store keeps what, the
// ids of what is new, and whether the change may be made are the act's, in act.ts; the
// writing is glass's format's.

import { act, openStore, type Store } from "../integrations/glass/store.ts";
import { actOf, type Change } from "./act.ts";
import { fieldOf, isWritable, read, type Attached, type Field, type Writable } from "./field.ts";
import type { Source } from "../integrations/source.ts";
import type { Answer, HolonRead, Read, Whole } from "./reads.ts";

export type { Attached, Change, HolonRead, Read, Whole };

export type Committed = { commit: string; ids: Record<string, string> };

export type Engine = {
  attach(key: string, store: Source, options?: { write?: false }): Promise<void>;
  attach(key: string, store: Store, options: { write: true }): Promise<void>;
  renew(key: string, store: Source): Promise<void>;
  read<R extends Read>(query: R): Promise<Answer<R>>;
  commit(change: Change): Promise<Committed>;
  onChange(listener: () => void): () => void;
};

// The stores whose head moved since they were opened, each as it now stands. One that
// cannot be read again is left as it was.
async function movedStores(targets: readonly Writable[]) {
  const now = await Promise.all(
    targets.map(async ({ key, store }) => {
      const reopened = await openStore(store.files, store.blocks).catch(() => store);
      return [key, reopened] as const;
    }),
  );

  return new Map(
    now.filter(([key, store]) => store.head !== targets.find((one) => one.key === key)!.store.head),
  );
}

export function startEngine(given: readonly Attached[] = []): Engine {
  let field = fieldOf(given);
  let turn: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  function inTurn<T>(task: () => Promise<T>) {
    const taken = turn.then(task);
    turn = taken.catch(() => undefined);
    return taken;
  }

  function become(next: Field) {
    field = next;
    for (const listener of listeners) listener();
  }

  // The field with some stores replaced by what they are now.
  const withStores = (now: ReadonlyMap<string, Store>) =>
    fieldOf(
      field.stores.map((attached) => {
        const next = now.get(attached.key);
        return next && isWritable(attached) ? { ...attached, store: next } : attached;
      }),
      field,
    );

  return {
    attach: (key, store, { write = false } = {}) =>
      inTurn(async () => {
        if (field.stores.some((attached) => attached.key === key))
          throw new Error(`a store is already attached as ${key}`);

        const attached: Attached = write ? { key, store: store as Store, write } : { key, store };
        become(fieldOf([...field.stores, attached], field));
      }),

    // A store this engine only reads, taken again as it now stands: what was published
    // since, and nothing of what one wrote, for nothing is written to a store only read.
    renew: (key, store) =>
      inTurn(async () => {
        const attached = field.stores.find((one) => one.key === key);
        if (!attached) throw new Error(`nothing is attached as ${key}`);
        if (isWritable(attached)) throw new Error(`${key} is written here, and is never taken again`);

        become(
          fieldOf(
            field.stores.map((one) => (one.key === key ? { key, store } : one)),
            field,
          ),
        );
      }),

    read: (query) => read(field, query),

    commit: (change) =>
      inTurn(async () => {
        const { writes, gone, born, ids } = await actOf(field, change);
        const writing = writes.map(({ key }) => field.stores.find((one) => one.key === key) as Writable);

        try {
          const done = await act(
            writes.map(({ holons }, i) => ({ store: writing[i]!.store, holons })),
            { says: change.says ?? "A change", gone, born },
          );
          become(withStores(new Map(writing.map(({ key }, i) => [key, done.stores[i]!]))));

          return { commit: done.act, ids };
        } catch (error) {
          // An act cut short may have moved some stores: those whose head moved are read
          // again as they now stand, and the field changes only if one did.
          const moved = await movedStores(writing);
          if (moved.size) become(withStores(moved));
          throw error;
        }
      }),

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
