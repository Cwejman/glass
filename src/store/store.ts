import type { Backend } from "./backend.ts";
import { canonical, type Json } from "./canonical.ts";
import { checked } from "./checked.ts";
import { isId, type Id } from "./id.ts";
import type { Name } from "./name.ts";
import {
  isRecord,
  type Body,
  type Branch,
  type Commit,
  type Index,
  type Leaf,
  type StoreObject,
  type Version,
} from "./objects.ts";
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
    const before = (id: Id) => (last ? lookup(objects, last.holons, id) : Promise.resolve(undefined));

    // A new version for each holon whose instance or body changed.
    const versioned = await Promise.all(
      change.holons.map(async (holon) => [holon.id, await versionFor(holon, await before(holon.id))] as const),
    );
    const updates = new Map(versioned.filter((entry): entry is [Id, Name] => entry[1] !== undefined));

    // The names as they were, with those the change gives or takes away.
    const given = Object.entries({ ...last?.names, ...change.names });
    const names = Object.fromEntries(given.filter((entry): entry is [string, Id] => typeof entry[1] === "string"));

    // What the change takes out, of what the field held.
    const held = await Promise.all((change.gone ?? []).map(async (id) => ((await before(id)) ? id : undefined)));
    const gone = new Set(held.filter((id) => id !== undefined));

    const namesChanged = canonical(names) !== canonical(last?.names ?? {});
    if (updates.size === 0 && gone.size === 0 && !namesChanged) return undefined;

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

  async function versionFor(holon: Holon, prev: Name | undefined): Promise<Name | undefined> {
    if (prev) {
      const { instance, body } = await versionOf(holon.id, prev);
      if (canonical([instance, body]) === canonical([holon.instance, holon.body])) return undefined;
    }
    return objects.put({
      kind: "version",
      id: holon.id,
      prev: prev ?? null,
      instance: holon.instance,
      body: holon.body,
    });
  }

  async function keptAfter(last: Index | undefined, gone: Set<Id>, updates: Map<Id, Name>) {
    const held = last ? await Array.fromAsync(entries(objects, last.holons)) : [];
    return new Map([...held.filter(([id]) => !gone.has(id)), ...updates]);
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

// What is wrong with a change before anything of it is written: each holon
// an id, a list of ids it is an instance of, and a body; each name an id;
// nothing written twice, or written and taken out at once.
function changeProblem(change: Change): string | undefined {
  if (typeof change.at !== "string") return "a change must say when it was made";

  for (const { id, instance, body } of change.holons) {
    if (!isId(id)) return `${id} is not an id`;
    if (!Array.isArray(instance) || !instance.every(isId)) return `${id}'s instance is not a list of ids`;
    if (!isRecord(body)) return `${id}'s body is not a JSON object`;
  }

  const badName = Object.entries(change.names ?? {}).find(([, id]) => id !== null && !isId(id));
  if (badName) return `the name ${badName[0]} must give an id`;

  const gone = change.gone ?? [];
  if (!Array.isArray(gone) || !gone.every(isId)) return "what is gone must be a list of ids";

  const ids = change.holons.map(({ id }) => id);
  const twice = ids.find((id, i) => ids.indexOf(id) !== i);
  if (twice) return `holon ${twice} changed twice in one commit`;
  const both = gone.find((id) => ids.includes(id));
  if (both) return `holon ${both} written and taken out in one commit`;

  return undefined;
}
