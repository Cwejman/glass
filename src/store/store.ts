import { canonical, type Json } from "./canonical.ts";
import type { Backend } from "./backend.ts";
import type { Id } from "./id.ts";
import { nameOf, nameOfText, type Name } from "./name.ts";
import {
  asObject,
  leafSize,
  type Body,
  type Branch,
  type Commit,
  type Index,
  type Leaf,
  type StoreObject,
  type Version,
} from "./objects.ts";

// A store over a backend. Everything read is checked against its name and its
// canonical form before it is trusted, and everything written is added, never
// rewritten: a change writes new versions, the parts of the index it touched,
// a new index and a commit, and then moves the ref.

export interface Holon {
  id: Id;
  instance: Id[];
  body: Body;
}

export interface Change {
  holons: Holon[];
  names?: { [name: string]: Id | null };
  at: string;
}

export class Store {
  private readonly cache = new Map<Name, StoreObject>();

  constructor(readonly backend: Backend) {}

  async object<T extends StoreObject>(name: Name): Promise<T> {
    const cached = this.cache.get(name);
    if (cached) return cached as T;
    const text = await this.backend.get(name);
    if (text === undefined) throw new Error(`missing object ${name}`);
    if ((await nameOfText(text)) !== name) throw new Error(`object ${name} does not hold what its name says`);
    const value = asObject(JSON.parse(text));
    if (canonical(value) !== text) throw new Error(`object ${name} is not in canonical form`);
    this.cache.set(name, value);
    return value as T;
  }

  // Objects that arrived another way, as in a bundle, are checked the same.
  async seed(name: Name, value: unknown) {
    const object = asObject(value);
    if ((await nameOf(object)) !== name) throw new Error(`object ${name} does not hold what its name says`);
    this.cache.set(name, object);
  }

  async head(ref = "main") {
    return this.backend.ref(ref);
  }

  async index(commit: Name) {
    return this.object<Index>((await this.object<Commit>(commit)).index);
  }

  async lookup(index: Index, id: Id): Promise<Name | undefined> {
    let node = await this.object<Leaf | Branch>(index.holons);
    while (node.kind === "index-branch") {
      const next = node.branches[charAt(id, node.depth)];
      if (!next) return undefined;
      node = await this.object<Leaf | Branch>(next);
    }
    return node.versions[id];
  }

  async *entries(index: Index): AsyncGenerator<[Id, Name]> {
    const walk = async function* (store: Store, name: Name): AsyncGenerator<[Id, Name]> {
      const node = await store.object<Leaf | Branch>(name);
      if (node.kind === "index-leaf") yield* Object.entries(node.versions) as [Id, Name][];
      else for (const child of Object.values(node.branches)) yield* walk(store, child);
    };
    yield* walk(this, index.holons);
  }

  async version(id: Id, commit?: Name): Promise<[Name, Version] | undefined> {
    commit ??= await this.head();
    if (!commit) return undefined;
    const name = await this.lookup(await this.index(commit), id);
    return name ? [name, await this.object<Version>(name)] : undefined;
  }

  async write(change: Change, ref = "main"): Promise<Name | undefined> {
    if (!this.backend.writable) throw new Error("this store is read only");
    const from = await this.head(ref);
    const last = from ? await this.index(from) : undefined;

    const updates = new Map<Id, Name>();
    for (const holon of change.holons) {
      if (updates.has(holon.id)) throw new Error(`holon ${holon.id} changed twice in one commit`);
      const prevName = last ? await this.lookup(last, holon.id) : undefined;
      if (prevName) {
        const prev = await this.object<Version>(prevName);
        if (canonical([prev.instance, prev.body]) === canonical([holon.instance, holon.body])) continue;
      }
      const version: Version = { kind: "version", id: holon.id, prev: prevName ?? null, instance: holon.instance, body: holon.body };
      updates.set(holon.id, await this.put(version));
    }

    const names = { ...last?.names };
    for (const [name, id] of Object.entries(change.names ?? {})) {
      if (id === null) delete names[name];
      else names[name] = id;
    }
    const namesChanged = canonical(names) !== canonical(last?.names ?? {});
    if (updates.size === 0 && !namesChanged) return undefined;

    const holons = await this.grow(last?.holons, 0, updates);
    const index = await this.put({ kind: "index", names, holons } satisfies Index);
    const commit = await this.put({ kind: "commit", parent: from ?? null, at: change.at, index } satisfies Commit);
    if (!(await this.backend.moveRef(ref, commit, from))) throw new Error(`ref ${ref} moved while writing`);
    return commit;
  }

  // Everything a commit reaches: the commit, its index, the tree and the
  // versions, but not the commits before it.
  async reach(commit: Name): Promise<Map<Name, Json>> {
    const reached = new Map<Name, Json>();
    const add = async (name: Name) => {
      const object = await this.object(name);
      reached.set(name, object as unknown as Json);
      return object;
    };
    const { index: indexName } = (await add(commit)) as Commit;
    const index = (await add(indexName)) as Index;
    const walk = async (name: Name): Promise<void> => {
      const node = (await add(name)) as Leaf | Branch;
      if (node.kind === "index-leaf") for (const version of Object.values(node.versions)) await add(version);
      else for (const child of Object.values(node.branches)) await walk(child);
    };
    await walk(index.holons);
    return reached;
  }

  private async put(object: StoreObject): Promise<Name> {
    const text = canonical(object);
    const name = await nameOfText(text);
    await this.backend.put(name, text);
    this.cache.set(name, object);
    return name;
  }

  // Sets entries in the tree under `at`, writing only the nodes on their way.
  private async grow(at: Name | undefined, depth: number, updates: Map<Id, Name>): Promise<Name> {
    const node: Leaf | Branch = at ? await this.object<Leaf | Branch>(at) : { kind: "index-leaf", depth, versions: {} };
    if (node.kind === "index-leaf") {
      const versions = { ...node.versions, ...Object.fromEntries(updates) };
      if (Object.keys(versions).length <= leafSize) return this.put({ kind: "index-leaf", depth, versions });
      const branches: Branch["branches"] = {};
      for (const [char, group] of groupBy(Object.entries(versions) as [Id, Name][], depth))
        branches[char] = await this.grow(undefined, depth + 1, group);
      return this.put({ kind: "index-branch", depth, branches });
    }
    const branches = { ...node.branches };
    for (const [char, group] of groupBy([...updates], depth)) branches[char] = await this.grow(branches[char], depth + 1, group);
    return this.put({ kind: "index-branch", depth, branches });
  }
}

function charAt(id: Id, depth: number) {
  return id[id.length - 1 - depth]!;
}

function groupBy(entries: [Id, Name][], depth: number) {
  const groups = new Map<string, Map<Id, Name>>();
  for (const [id, name] of entries) {
    const char = charAt(id, depth);
    if (!groups.has(char)) groups.set(char, new Map());
    groups.get(char)!.set(id, name);
  }
  return groups;
}
