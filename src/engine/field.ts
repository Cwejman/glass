import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { Body, Version } from "../store/objects.ts";
import type { Holon, Store } from "../store/store.ts";
import { references, type Reference } from "./references.ts";
import { bodyProblem, fieldsOf, type Fields } from "./types.ts";

// The field is the stores an engine holds, read as one, held as a value: each
// store as it stood at its head, the home first. A field never changes; an
// attach or a commit makes the next one. Reading it and judging a commit
// against it are functions of the field alone, and a store's past, which
// never changes either.

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

// A store as it stands at its head: its names and every holon in it.
export interface Standing {
  readonly key: string;
  readonly store: Store;
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

export interface Field {
  readonly stores: readonly Standing[];
  readonly known: ReadonlyMap<Id, Known>;
  readonly holders: ReadonlyMap<Id, readonly Holder[]>;
}

export async function standing(key: string, store: Store): Promise<Standing> {
  const head = await store.head();
  const holons = new Map<Id, Known>();
  let names: Record<string, Id> = {};
  if (head) {
    const index = await store.index(head);
    names = index.names;
    for await (const [id, name] of store.entries(index)) holons.set(id, { key, name, version: await store.versionOf(id, name) });
  }
  return { key, store, head, names, holons };
}

// The stores read as one. A holon two stores hold is read from the first,
// so the home's stand before a pulled store's; every reference in every body
// is indexed by what it points at.
export function fieldOf(stores: readonly Standing[]): Field {
  const known = new Map<Id, Known>();
  for (const { holons } of stores) for (const [id, holon] of holons) if (!known.has(id)) known.set(id, holon);
  const holders = new Map<Id, Holder[]>();
  for (const { version } of known.values())
    for (const reference of references(version.body)) {
      const holder = { ...reference, from: version.id };
      const held = holders.get(reference.id);
      if (held) held.push(holder);
      else holders.set(reference.id, [holder]);
    }
  return { stores, known, holders };
}

export const home = (field: Field) => field.stores[0]!;

export async function read(field: Field, read: Read): Promise<Json> {
  if ("holon" in read) {
    if (read.at) return readAt(field, read.holon, read.at);
    const known = field.known.get(read.holon);
    return known ? view(known) : null;
  }
  if ("name" in read) {
    for (const { names } of field.stores) {
      const id = names[read.name];
      if (id && field.known.has(id)) return id;
    }
    return null;
  }
  if ("head" in read) return field.stores.find(({ key }) => key === read.head)?.head ?? null;
  if ("holders" in read) return (field.holders.get(read.holders) ?? []).map(({ from, key, pinned }) => ({ id: from, key, ...(pinned ? { pinned } : {}) }));
  return [...field.known.values()].filter(({ version }) => version.instance.includes(read.instances)).map(({ version }) => version.id);
}

// What is wrong with a commit, held against the field, if anything. It lands
// in the home, so nothing it writes or takes out may be a pulled store's;
// each holon's types must be in the field and its body fit them all; what
// it references and pins must be in the field; nothing left may point at
// what it takes out; and every name must give a holon that stays.
export async function judge(field: Field, commit: Commit): Promise<string | undefined> {
  const born = new Map(commit.holons.map((holon) => [holon.id, holon]));
  const gone = new Set(commit.gone ?? []);

  for (const id of [...born.keys(), ...gone]) {
    const known = field.known.get(id);
    if (known && known.key !== home(field).key) return `${id} belongs to ${known.key}, which is only read`;
  }
  for (const holon of commit.holons) {
    const problem = await holonProblem(field, holon, born);
    if (problem) return `${holon.id}: ${problem}`;
  }
  if (gone.size)
    for (const holon of [...[...field.known.values()].map(({ version }) => born.get(version.id) ?? version), ...born.values()]) {
      if (gone.has(holon.id)) continue;
      const lost = references(holon.body).find((reference) => gone.has(reference.id));
      if (lost) return `${holon.id} still references ${lost.id}, which would be gone`;
    }
  for (const [name, id] of Object.entries(commit.names ?? {}))
    if (id !== null && ((!born.has(id) && !field.known.has(id)) || gone.has(id))) return `the name ${name} gives ${id}, which is not in the field`;
  return undefined;
}

async function holonProblem(field: Field, holon: Holon, born: Map<Id, Holon>): Promise<string | undefined> {
  if (holon.instance.length === 0) return "it is an instance of nothing";
  const types: Fields[] = [];
  try {
    if (holon.body.fields !== undefined) fieldsOf(holon.body);
    for (const type of holon.instance) {
      const body = born.get(type)?.body ?? field.known.get(type)?.version.body;
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
    if (!born.has(reference.id) && !field.known.has(reference.id)) return `it references ${reference.id}, which is not in the field`;
    if (reference.pinned && !(await isVersion(field, reference.id, reference.pinned)))
      return `it pins ${reference.pinned}, which is not a version of ${reference.id} in the field`;
  }
  return undefined;
}

async function isVersion(field: Field, id: Id, version: Name) {
  for (const { store } of field.stores) if (await store.versionOf(id, version).catch(() => undefined)) return true;
  return false;
}

async function readAt(field: Field, id: Id, at: Name): Promise<Json> {
  for (const { key, store } of field.stores) {
    const found = await store.version(id, at).catch(() => undefined);
    if (found) return view({ key, name: found[0], version: found[1] });
  }
  return null;
}

function view({ key, name, version }: Known): Json {
  return { id: version.id, store: key, version: name, instance: version.instance, body: version.body } satisfies HolonRead as unknown as Json;
}
