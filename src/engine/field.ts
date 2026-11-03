import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { Body, Version } from "../store/objects.ts";
import type { Change as StoreChange, Holon, Store } from "../store/store.ts";
import { references, type Reference } from "./references.ts";
import { firstAsync, firstOf, firstOfAsync, type Problem } from "./problem.ts";
import { bodyProblem, connectorsOf, isType, typeProblem } from "./types.ts";

// The field is the stores an engine holds, read as one, held as a value: each
// store as it stood at its head, the home first, as plain data. A field
// never changes; an attach or a commit makes the next one. Reading it and
// judging a change against it are functions of the field, and of the
// stores' past, which never changes either and is asked for by its own name.

// What may be read of a field: a holon, now or at a commit; what a name
// gives; what points at a holon; a type's instances; a store's head; and
// the field itself, as a place.
export type Read =
  | { holon: Id; at?: Name }
  | { name: string }
  | { holders: Id }
  | { instances: Id }
  | { head: string }
  | { field: true };

// The field as a place: no holon holds it, so the engine shows it from what
// the field holds. Each store with its head and the names it gives, and
// every type with how many holons are its instances.
export interface FieldPlace {
  stores: { key: string; head: Name | null; names: Record<string, Id> }[];
  types: { id: Id; instances: number }[];
}

export interface HolonRead {
  id: Id;
  store: string;
  version: Name;
  instance: Id[];
  body: Body;
}

// A change to the field, as the engine is asked for it; the store adds when.
export type Change = Omit<StoreChange, "at">;

// A store as it stands at its head: its names and every holon in it.
export interface Standing {
  readonly key: string;
  readonly head: Name | undefined;
  readonly names: Readonly<Record<string, Id>>;
  readonly holons: ReadonlyMap<Id, Known>;
}

export interface Known {
  readonly key: string;
  readonly name: Name;
  readonly version: Version;
}

export interface Holder extends Reference {
  readonly from: Id;
}

// The stores' past: a holon as it stood at a commit, and whether a version is
// one of a holon's. What was is never changed, so asking it is as pure as
// reading the field.
export interface Past {
  versionAt(id: Id, commit: Name): Promise<Known | undefined>;
  isVersion(id: Id, version: Name): Promise<boolean>;
}

export interface Field {
  readonly stores: readonly Standing[];
  readonly known: ReadonlyMap<Id, Known>;
  readonly holders: ReadonlyMap<Id, readonly Holder[]>;
}

export async function standing(key: string, store: Store): Promise<Standing> {
  const head = await store.head();
  if (!head) return { key, head, names: {}, holons: new Map() };
  const index = await store.index(head);
  const held = await Array.fromAsync(store.entries(index));
  const holons = await Promise.all(
    held.map(async ([id, name]) => [id, { key, name, version: await store.versionOf(id, name) }] as const),
  );
  return { key, head, names: index.names, holons: new Map(holons) };
}

// The past of the stores an engine holds, asked of each in turn until one
// answers.
export function pastOf(stores: readonly { key: string; store: Store }[]): Past {
  // A store that does not hold what is asked answers nothing, and the next
  // is asked.
  const firstFound = <T>(ask: (store: Store, key: string) => Promise<T | undefined>) =>
    stores.reduce<Promise<T | undefined>>(
      async (found, { key, store }) => (await found) ?? ask(store, key).catch(() => undefined),
      Promise.resolve(undefined),
    );

  return {
    versionAt: (id, commit) =>
      firstFound(async (store, key) => {
        const found = await store.version(id, commit);
        return found && { key, name: found[0], version: found[1] };
      }),

    isVersion: async (id, version) =>
      (await firstFound((store) => store.versionOf(id, version))) !== undefined,
  };
}

// The stores read as one. A holon two stores hold is read from the first,
// so the home's stand before a pulled store's; every reference in every body
// is indexed by what it points at.
export function fieldOf(stores: readonly Standing[]): Field {
  // Laid from the last store to the first, so the first store's holon is
  // the one left standing.
  const known = new Map(stores.toReversed().flatMap(({ holons }) => [...holons]));

  const held = [...known.values()].flatMap(({ version }) =>
    references(version.body).map((reference) => ({ ...reference, from: version.id })),
  );

  return { stores, known, holders: Map.groupBy(held, ({ id }) => id) };
}

export async function read(field: Field, past: Past, read: Read): Promise<Json> {
  if ("holon" in read) {
    const known = read.at ? await past.versionAt(read.holon, read.at) : field.known.get(read.holon);
    return known ? view(known) : null;
  }
  if ("name" in read)
    return (
      field.stores
        .map(({ names }) => names[read.name])
        .find((id) => id !== undefined && field.known.has(id)) ?? null
    );
  if ("head" in read) return field.stores.find(({ key }) => key === read.head)?.head ?? null;
  if ("field" in read) return placeOf(field) as unknown as Json;
  if ("holders" in read)
    return (field.holders.get(read.holders) ?? []).map(({ from, key, pinned }) => ({
      id: from,
      key,
      ...(pinned ? { pinned } : {}),
    }));
  return [...field.known.values()]
    .filter(({ version }) => version.instance.includes(read.instances))
    .map(({ version }) => version.id);
}

// What is wrong with a change, held against the field, if anything. It lands
// in the home, so nothing it writes or takes out may be a pulled store's;
// each holon must be sound on its own; nothing left may point at what it
// takes out; and every name must give a holon that stays.
export function judge(field: Field, past: Past, change: Change): Promise<Problem> {
  const born = new Map(change.holons.map((holon) => [holon.id, holon]));
  const gone = new Set(change.gone ?? []);
  const home = field.stores[0]!.key;

  const pulled = (id: Id): Problem => {
    const known = field.known.get(id);
    return known && known.key !== home ? `${id} belongs to ${known.key}, which is only read` : undefined;
  };

  const unsound = async (holon: Holon): Promise<Problem> => {
    const problem = await holonProblem(field, past, holon, born);
    return problem && `${holon.id}: ${problem}`;
  };

  const staying = [...field.known.values()]
    .map(({ version }) => born.get(version.id) ?? version)
    .concat([...born.values()].filter(({ id }) => !field.known.has(id)))
    .filter(({ id }) => !gone.has(id));

  const pointsAtGone = (holon: Holon): Problem => {
    const lost = references(holon.body).find(({ id }) => gone.has(id));
    return lost && `${holon.id} still references ${lost.id}, which would be gone`;
  };

  const givesNothing = ([name, id]: [string, Id | null]): Problem => {
    const stays = id !== null && (born.has(id) || field.known.has(id)) && !gone.has(id);
    return id === null || stays ? undefined : `the name ${name} gives ${id}, which is not in the field`;
  };

  return firstAsync(
    () => firstOf([...born.keys(), ...gone], pulled),
    () => firstOfAsync(change.holons, unsound),
    () => firstOf(staying, pointsAtGone),
    () => firstOf(Object.entries(change.names ?? {}), givesNothing),
  );
}

// A holon judged on its own: an instance of types the field holds, its body
// fitting them all, a type's own fields well said, and all it references and
// pins in the field.
function holonProblem(field: Field, past: Past, holon: Holon, born: Map<Id, Holon>): Promise<Problem> {
  const bodyOf = (type: Id) => born.get(type)?.body ?? field.known.get(type)?.version.body;

  const notAType = (type: Id): Problem => {
    const body = bodyOf(type);
    if (!body) return `its type ${type} is not in the field`;
    if (!isType(body)) return `${type} is not a type`;
    return typeProblem(body);
  };

  const outOfField = async ({ id, pinned }: Reference): Promise<Problem> => {
    if (!born.has(id) && !field.known.has(id)) return `it references ${id}, which is not in the field`;
    if (pinned && !(await past.isVersion(id, pinned)))
      return `it pins ${pinned}, which is not a version of ${id} in the field`;
    return undefined;
  };

  return firstAsync(
    () => (holon.instance.length === 0 ? "it is an instance of nothing" : undefined),
    () => typeProblem(holon.body),
    () => firstOf(holon.instance, notAType),
    () =>
      bodyProblem(
        holon.body,
        holon.instance.map((type) => connectorsOf(bodyOf(type)!)),
      ),
    () => firstOfAsync(references(holon.body), outOfField),
  );
}

function placeOf(field: Field): FieldPlace {
  const versions = [...field.known.values()].map(({ version }) => version);
  const types = versions.filter(({ body }) => isType(body));
  return {
    stores: field.stores.map(({ key, head, names }) => ({ key, head: head ?? null, names: { ...names } })),
    types: types.map(({ id }) => ({
      id,
      instances: versions.filter(({ instance }) => instance.includes(id)).length,
    })),
  };
}

function view({ key, name, version }: Known): Json {
  return {
    id: version.id,
    store: key,
    version: name,
    instance: version.instance,
    body: version.body,
  } satisfies HolonRead as unknown as Json;
}
