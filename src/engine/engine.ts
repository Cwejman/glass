import type { Json } from "../store/canonical.ts";
import type { Name } from "../store/name.ts";
import type { Store } from "../store/store.ts";
import { fieldOf, judge, pastOf, read, standing, type Change, type Field, type Read } from "./field.ts";

export type { Change, HolonRead, Read } from "./field.ts";

// The engine holds the stores it attaches and is the only way into them. Its
// home is the one store it writes; every store it pulls is read, never
// written. Beside the stores themselves it keeps only the field as it
// stands now: it takes attaches and commits one at a time, each making the
// next field from the one before, and tells whoever listens that the field
// has changed.

export class Engine {
  private readonly stores: { key: string; store: Store }[];
  private field: Field;
  private turn: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  constructor(home: Store) {
    this.stores = [{ key: "home", store: home }];
    this.field = fieldOf([{ key: "home", head: undefined, names: {}, holons: new Map() }]);
  }

  start() {
    return this.inTurn(async () => {
      this.field = await this.restand();
    });
  }

  attach(key: string, store: Store) {
    return this.inTurn(async () => {
      if (this.stores.some((attached) => attached.key === key)) throw new Error(`a store is already attached as ${key}`);
      const next = fieldOf([...this.field.stores, await standing(key, store)]);
      this.stores.push({ key, store });
      this.become(next);
    });
  }

  read(query: Read): Promise<Json> {
    return read(this.field, pastOf(this.stores), query);
  }

  commit(change: Change): Promise<Name | undefined> {
    return this.inTurn(async () => {
      const problem = await judge(this.field, pastOf(this.stores), change);
      if (problem) throw new Error(problem);
      const name = await this.stores[0]!.store.write({ ...change, at: new Date().toISOString() });
      if (name) this.become(await this.restand());
      return name;
    });
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // The field again, with the home as it stands now and every pulled store
  // as it stood.
  private async restand() {
    return fieldOf([await standing("home", this.stores[0]!.store), ...this.field.stores.slice(1)]);
  }

  private become(field: Field) {
    this.field = field;
    for (const listener of this.listeners) listener();
  }

  private inTurn<T>(work: () => Promise<T>): Promise<T> {
    const turn = this.turn.then(work);
    this.turn = turn.catch(() => undefined);
    return turn;
  }
}
