import type { Backend } from "./backend.ts";
import { canonical, type Json } from "./canonical.ts";
import { checked } from "./checked.ts";
import { isId, type Id } from "./id.ts";
import type { Name } from "./name.ts";
import { isRecord, type Body, type Branch, type Commit, type Index, type Leaf, type StoreObject, type Version } from "./objects.ts";
import { entries, grow, lookup, plant } from "./tree.ts";

// A store over a backend: what it holds read through its checked objects,
// and everything written added, never rewritten. Opening a store keeps
// nothing but the objects it has already checked.

export interface Holon {
  id: Id;
  instance: Id[];
  body: Body;
}

// A change writes holons, gives or takes names, and may take holons out of
// the field: they are gone from its index from then on, and every version
// they had stays in the store, read from the commits before.
export interface Change {
  holons: Holon[];
  names?: { [name: string]: Id | null };
  gone?: Id[];
  at: string;
}

export interface Store {
  readonly writable: boolean;
  head(ref?: string): Promise<Name | undefined>;
  object<T extends StoreObject>(name: Name): Promise<T>;
  seed(name: Name, value: unknown): Promise<void>;
  index(commit: Name): Promise<Index>;
  entries(index: Index): AsyncGenerator<[Id, Name]>;
  version(id: Id, commit?: Name): Promise<[Name, Version] | undefined>;
  versionOf(id: Id, name: Name): Promise<Version>;
  write(change: Change, ref?: string): Promise<Name | undefined>;
  reach(commit: Name): Promise<Map<Name, Json>>;
}

export function openStore(backend: Backend): Store {
  const objects = checked(backend);
  const head = (ref = "main") => backend.ref(ref);
  const index = async (commit: Name) => objects.get<Index>((await objects.get<Commit>(commit)).index);

  async function versionOf(id: Id, name: Name) {
    const version = await objects.get<Version>(name);
    if (version.kind !== "version" || version.id !== id) throw new Error(`${name} is not a version of ${id}`);
    return version;
  }

  async function version(id: Id, commit?: Name): Promise<[Name, Version] | undefined> {
    commit ??= await head();
    if (!commit) return undefined;
    const name = await lookup(objects, (await index(commit)).holons, id);
    return name ? [name, await versionOf(id, name)] : undefined;
  }

  // A change writes a version for each holon that changed, the nodes of the
  // tree on their way, a new index and a commit, and then moves the ref, but
  // only from the commit it started from.
  async function write(change: Change, ref = "main"): Promise<Name | undefined> {
    if (!backend.writable) throw new Error("this store is read only");
    const problem = changeProblem(change);
    if (problem) throw new Error(problem);
    const from = await head(ref);
    const last = from ? await index(from) : undefined;

    const updates = new Map<Id, Name>();
    for (const holon of change.holons) {
      if (updates.has(holon.id)) throw new Error(`holon ${holon.id} changed twice in one commit`);
      const prevName = last ? await lookup(objects, last.holons, holon.id) : undefined;
      if (prevName) {
        const prev = await versionOf(holon.id, prevName);
        if (canonical([prev.instance, prev.body]) === canonical([holon.instance, holon.body])) continue;
      }
      updates.set(holon.id, await objects.put({ kind: "version", id: holon.id, prev: prevName ?? null, instance: holon.instance, body: holon.body }));
    }

    const given = new Map(Object.entries(last?.names ?? {}));
    for (const [name, id] of Object.entries(change.names ?? {})) {
      if (id === null) given.delete(name);
      else given.set(name, id);
    }
    const names = Object.fromEntries(given);
    const gone = new Set<Id>();
    for (const id of change.gone ?? []) {
      if (updates.has(id)) throw new Error(`holon ${id} written and taken out in one commit`);
      if (last && (await lookup(objects, last.holons, id))) gone.add(id);
    }
    if (updates.size === 0 && gone.size === 0 && canonical(names) === canonical(last?.names ?? {})) return undefined;

    const holons = gone.size
      ? await plant(objects, await keptAfter(last, gone, updates))
      : last && updates.size === 0
        ? last.holons
        : await grow(objects, last?.holons, updates);
    const indexName = await objects.put({ kind: "index", names, holons });
    const commit = await objects.put({ kind: "commit", parent: from ?? null, at: change.at, index: indexName });
    if (!(await backend.moveRef(ref, commit, from))) throw new Error(`ref ${ref} moved while writing`);
    return commit;
  }

  async function keptAfter(last: Index | undefined, gone: Set<Id>, updates: Map<Id, Name>) {
    const kept = new Map<Id, Name>();
    if (last) for await (const [id, name] of entries(objects, last.holons)) if (!gone.has(id)) kept.set(id, name);
    for (const [id, name] of updates) kept.set(id, name);
    return kept;
  }

  // Everything a commit reaches: the commit, its index, the tree and the
  // versions, but not the commits before it.
  async function reach(commit: Name): Promise<Map<Name, Json>> {
    const reached = new Map<Name, Json>();
    const add = async <T extends StoreObject>(name: Name) => {
      const object = await objects.get<T>(name);
      reached.set(name, object as unknown as Json);
      return object;
    };
    const { holons } = await add<Index>((await add<Commit>(commit)).index);
    const walk = async (name: Name): Promise<void> => {
      const node = await add<Leaf | Branch>(name);
      if (node.kind === "index-leaf") for (const version of Object.values(node.versions)) await add(version);
      else for (const child of Object.values(node.branches)) await walk(child);
    };
    await walk(holons);
    return reached;
  }

  return {
    writable: backend.writable,
    head,
    object: objects.get,
    seed: objects.seed,
    index,
    entries: (at) => entries(objects, at.holons),
    version,
    versionOf,
    write,
    reach,
  };
}

function changeProblem(change: Change): string | undefined {
  if (typeof change.at !== "string") return "a change must say when it was made";
  for (const holon of change.holons) {
    if (!isId(holon.id)) return `${holon.id} is not an id`;
    if (!Array.isArray(holon.instance) || !holon.instance.every(isId)) return `${holon.id}'s instance is not a list of ids`;
    if (!isRecord(holon.body)) return `${holon.id}'s body is not a JSON object`;
  }
  for (const [name, id] of Object.entries(change.names ?? {}))
    if (id !== null && !isId(id)) return `the name ${name} must give an id`;
  if (change.gone !== undefined && (!Array.isArray(change.gone) || !change.gone.every(isId))) return "what is gone must be a list of ids";
  return undefined;
}
