import type { Json } from "../store/canonical.ts";
import type { Name } from "../store/name.ts";
import type { Store } from "../store/store.ts";
import { fieldOf, home, judge, read, standing, type Commit, type Field, type Read } from "./field.ts";

export type { Commit, HolonRead, Read } from "./field.ts";

// The engine holds the stores it attaches and is the only way into them. Its
// home is the one store it writes; every store it pulls is read, never
// written. All it keeps is the field as it stands now: it takes attaches and
// commits one at a time, each making the next field from the one before,
// and tells whoever listens that the field has changed.

export class Engine {
  private field: Field;
  private turn: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly homeStore: Store) {
    this.field = fieldOf([{ key: "home", store: homeStore, head: undefined, names: {}, holons: new Map() }]);
  }

  start() {
    return this.inTurn(async () => {
      this.field = fieldOf([await standing("home", this.homeStore), ...this.field.stores.slice(1)]);
    });
  }

  attach(key: string, store: Store) {
    return this.inTurn(async () => {
      if (this.field.stores.some((attached) => attached.key === key)) throw new Error(`a store is already attached as ${key}`);
      this.become(fieldOf([...this.field.stores, await standing(key, store)]));
    });
  }

  read(query: Read): Promise<Json> {
    return read(this.field, query);
  }

  commit(commit: Commit): Promise<Name | undefined> {
    return this.inTurn(async () => {
      const problem = await judge(this.field, commit);
      if (problem) throw new Error(problem);
      const name = await home(this.field).store.write({ ...commit, at: new Date().toISOString() });
      if (name) this.become(fieldOf([await standing("home", this.homeStore), ...this.field.stores.slice(1)]));
      return name;
    });
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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
