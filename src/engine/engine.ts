import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { Body, Version } from "../store/objects.ts";
import type { Holon, Store } from "../store/store.ts";
import { references, type Reference } from "./references.ts";
import { bodyProblem, fieldsOf, type Fields } from "./types.ts";

// The engine holds the stores it attaches and is the only way into them. Its
// home is the one store it writes; every store it pulls is read, never
// written. It reads them all as one field, keeps one index over the
// references in every body, and judges every commit against the types the
// field declares.

export type Read =
  | { holon: Id; at?: Name }
  | { name: string }
  | { holders: Id }
  | { instances: Id }
  | { head: string };

export interface HolonRead {
  id: Id;
  store: string;
  version: Name;
  instance: Id[];
  body: Body;
}

export interface Commit {
  holons: Holon[];
  names?: { [name: string]: Id | null };
  gone?: Id[];
}

interface Attached {
  key: string;
  store: Store;
  head?: Name;
  holons: Map<Id, Known>;
}

interface Known {
  store: Attached;
  name: Name;
  version: Version;
}

export class Engine {
  private readonly stores: Attached[] = [];
  private readonly known = new Map<Id, Known>();
  private readonly holders = new Map<Id, (Reference & { from: Id })[]>();
  private readonly listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(home: Store) {
    this.stores.push({ key: "home", store: home, holons: new Map() });
  }

  get home() {
    return this.stores[0]!;
  }

  // Attaching reads a store's head whole into the engine's index. The home is
  // read the same way when the engine starts.
  attach(key: string, store: Store) {
    return this.inTurn(async () => {
      if (this.stores.some((attached) => attached.key === key)) throw new Error(`a store is already attached as ${key}`);
      const attached: Attached = { key, store, holons: new Map() };
      await this.load(attached);
      this.stores.push(attached);
      this.reindex();
      this.changed();
    });
  }

  async start() {
    await this.load(this.home);
    this.reindex();
  }

  async read(read: Read): Promise<Json> {
    if ("holon" in read) {
      if (read.at) return this.readAt(read.holon, read.at);
      const known = this.known.get(read.holon);
      return known ? (this.view(known) as unknown as Json) : null;
    }
    if ("name" in read) {
      for (const attached of this.stores) {
        if (!attached.head) continue;
        const id = (await attached.store.index(attached.head)).names[read.name];
        if (id && this.known.has(id)) return id;
      }
      return null;
    }
    if ("head" in read) return this.stores.find((attached) => attached.key === read.head)?.head ?? null;
    if ("holders" in read)
      return (this.holders.get(read.holders) ?? []).map(({ from, key, pinned }) => ({ id: from, key, ...(pinned ? { pinned } : {}) }));
    return [...this.known.values()].filter((known) => known.version.instance.includes(read.instances)).map((known) => known.version.id);
  }

  // A commit lands in the home. Each holon is judged first: it may not be one a
  // pulled store holds, its types must be in the field, its body must fit
  // them, and everything it references must be in the field.
  // Commits are taken one at a time, each judged against the field as the one
  // before left it.
  commit(commit: Commit): Promise<Name | undefined> {
    return this.inTurn(async () => {
      const born = new Map(commit.holons.map((holon) => [holon.id, holon]));
      for (const holon of commit.holons) {
        const known = this.known.get(holon.id);
        if (known && known.store !== this.home) throw new Error(`${holon.id} belongs to ${known.store.key}, which is only read`);
        const problem = await this.judge(holon, born);
        if (problem) throw new Error(`${holon.id}: ${problem}`);
      }
      const gone = new Set(commit.gone ?? []);
      for (const id of gone) {
        const known = this.known.get(id);
        if (known && known.store !== this.home) throw new Error(`${id} belongs to ${known.store.key}, which is only read`);
      }
      if (gone.size)
        for (const known of [...this.known.values(), ...commit.holons.map((holon) => ({ version: holon }))]) {
          if (gone.has(known.version.id)) continue;
          const holon = born.get(known.version.id) ?? known.version;
          const lost = references(holon.body).find((reference) => gone.has(reference.id));
          if (lost) throw new Error(`${holon.id} still references ${lost.id}, which would be gone`);
        }
      for (const [name, id] of Object.entries(commit.names ?? {}))
        if (id !== null && ((!born.has(id) && !this.known.has(id)) || gone.has(id)))
          throw new Error(`the name ${name} gives ${id}, which is not in the field`);
      const name = await this.home.store.write({ ...commit, at: new Date().toISOString() });
      if (name) {
        await this.load(this.home);
        this.reindex();
        this.changed();
      }
      return name;
    });
  }

  private inTurn<T>(work: () => Promise<T>): Promise<T> {
    const turn = this.queue.then(work);
    this.queue = turn.catch(() => undefined);
    return turn;
  }

  private changed() {
    for (const listener of this.listeners) listener();
  }

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async judge(holon: Holon, born: Map<Id, Holon>): Promise<string | undefined> {
    if (holon.instance.length === 0) return "it is an instance of nothing";
    const types: Fields[] = [];
    try {
      if (holon.body.fields !== undefined) fieldsOf(holon.body);
      for (const type of holon.instance) {
        const body = born.get(type)?.body ?? this.known.get(type)?.version.body;
        if (!body) return `its type ${type} is not in the field`;
        const fields = fieldsOf(body);
        if (!fields) return `${type} is not a type`;
        types.push(fields);
      }
    } catch (error) {
      return (error as Error).message;
    }
    const problem = bodyProblem(holon.body, types);
    if (problem) return problem;
    for (const reference of references(holon.body)) {
      if (!born.has(reference.id) && !this.known.has(reference.id)) return `it references ${reference.id}, which is not in the field`;
      if (reference.pinned && !(await this.pinned(reference.id, reference.pinned)))
        return `it pins ${reference.pinned}, which is not a version of ${reference.id} in the field`;
    }
    return undefined;
  }

  private async pinned(id: Id, version: Name) {
    for (const attached of this.stores) if (await attached.store.versionOf(id, version).catch(() => undefined)) return true;
    return false;
  }

  private async readAt(id: Id, at: Name): Promise<Json> {
    for (const attached of this.stores) {
      const found = await attached.store.version(id, at).catch(() => undefined);
      if (found) return this.view({ store: attached, name: found[0], version: found[1] }) as unknown as Json;
    }
    return null;
  }

  private view({ store, name, version }: Known): HolonRead {
    return { id: version.id, store: store.key, version: name, instance: version.instance, body: version.body };
  }

  private async load(attached: Attached) {
    attached.head = await attached.store.head();
    const holons = new Map<Id, Known>();
    if (attached.head) {
      const index = await attached.store.index(attached.head);
      for await (const [id, name] of attached.store.entries(index))
        holons.set(id, { store: attached, name, version: await attached.store.versionOf(id, name) });
    }
    attached.holons = holons;
  }

  // The home is read first, so its holons stand before those of pulled stores.
  private reindex() {
    this.known.clear();
    this.holders.clear();
    for (const attached of this.stores)
      for (const [id, known] of attached.holons)
        if (!this.known.has(id)) this.known.set(id, known);
    for (const known of this.known.values())
      for (const reference of references(known.version.body)) {
        if (!this.holders.has(reference.id)) this.holders.set(reference.id, []);
        this.holders.get(reference.id)!.push({ ...reference, from: known.version.id });
      }
  }
}
