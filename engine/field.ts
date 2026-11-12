// The field is the stores an engine has attached, read as one: a value, made anew by
// every attach, detach, act and store moved. One holon, or one whole with what it holds,
// costs a few blocks. A question over the field reads each store whole, once, and what
// was read is carried to the next field wherever its store is unchanged.

import { asHolon, type Holon, type LogEntry, type Store } from "../integrations/glass/store.ts";
import type { Source } from "../integrations/source.ts";
import { mouldOf, partsOf } from "./moulds.ts";
import { worldOf, type Found, type World } from "./read/world.ts";
import type { Shelf } from "./read/patterns/shelf.ts";

// A store as this engine uses it: what it is called here, and whether it may be written.
// One it reads is any source; one it writes is glass's own store.
export type Attachment =
  | { key: string; store: Source; write?: false }
  | { key: string; store: Store; write: true };

export type Writable = Extract<Attachment, { write: true }>;

export const isWritable = (attachment: Attachment): attachment is Writable => attachment.write === true;

export type Field = {
  stores: readonly Attachment[];
  // A store's holons, all of them, read once.
  holonsOf(key: string): Promise<readonly Found[]>;
  // Everything attached, read as one, once.
  world(): Promise<World>;
  // A store's history, read once; and those read so far, as they stand.
  logOf(key: string): Promise<LogEntry[]>;
  logsRead(key: string): LogEntry[] | undefined;
  // Each store's index as last made: found on the field before, and kept here only, so an
  // index is patched from the one before rather than made again.
  shelf: Shelf;
};

export const fieldOf = (stores: readonly Attachment[], before?: Field): Field => {
  const shelf: Shelf = new Map(before?.shelf);
  const holonsOf = (key: string) => {
    const attachment = stores.find((one) => one.key === key);
    return attachment ? holonsIn(attachment) : Promise.resolve([]);
  };
  const logsRead = (key: string) => {
    const attachment = stores.find((one) => one.key === key);
    return attachment ? logsKept.get(attachment.store) : [];
  };

  const field: Field = {
    stores,
    holonsOf,
    shelf,
    logOf: async (key) => {
      const attachment = stores.find((one) => one.key === key);
      return attachment ? logIn(attachment.store) : [];
    },
    logsRead,
    world: once(async () =>
      worldOf({
        stores: stores.map(({ key }) => key),
        byStore: await Promise.all(stores.map(({ key }) => holonsOf(key))),
        logs: logsRead,
        shelf,
      }),
    ),
  };

  return field;
};

// ---- Fields made from fields

export function attached(field: Field, attachment: Attachment) {
  if (field.stores.some(({ key }) => key === attachment.key))
    throw new Error(`a store is already attached as ${attachment.key}`);

  return fieldOf([...field.stores, attachment], field);
}

export function detached(field: Field, key: string) {
  if (!field.stores.some((one) => one.key === key)) throw new Error(`nothing is attached as ${key}`);

  return fieldOf(
    field.stores.filter((one) => one.key !== key),
    field,
  );
}

// The field with some stores as they now stand, after an act or a move from outside.
export const withStores = (field: Field, now: ReadonlyMap<string, Source | Store>) =>
  fieldOf(
    field.stores.map((one) =>
      now.has(one.key) ? ({ ...one, store: now.get(one.key)! } as Attachment) : one,
    ),
    field,
  );

// ---- Reading by identity

// The stores keeping a holon, in the order they were attached, each with the version
// it keeps. Only a store that may hold the id is asked.
export async function keepersOf(field: Field, id: string) {
  const asked = await Promise.all(
    field.stores
      .filter(({ store }) => store.mayHold(id))
      .map(async (attachment) => ({ attachment, latest: await attachment.store.read(id) })),
  );

  return asked.flatMap(({ attachment, latest }) => (latest ? [{ ...attachment, latest }] : []));
}

// A holon as the field reads it: from the first store that keeps it.
export async function keptIn(field: Field, id: string): Promise<Found | null> {
  const [first] = await keepersOf(field, id);
  return first ? { store: first.key, holon: asHolon(first.latest.version), block: first.latest.block } : null;
}

export const holonOf = async (field: Field, id: string): Promise<Holon | null> =>
  (await keptIn(field, id))?.holon ?? null;

// ---- A holon, and a whole, as a reader is given them

export type HolonRead = Holon & { store: string; version: string; types: string[] };

// The names of what a holon is, as a reader is given them: "type" where it is one.
export const typeNames = (holon: Holon, types: readonly (Holon | null | undefined)[]) => [
  ...(holon.mould ? ["type"] : []),
  ...types.flatMap((type) => (type?.name ? [type.name] : [])),
];

export async function readHolon(field: Field, id: string): Promise<HolonRead | null> {
  const kept = await keptIn(field, id);
  if (!kept) return null;

  const types = await Promise.all(
    kept.holon.instance.map(async (type) => (await keptIn(field, type))?.holon ?? null),
  );
  return { ...kept.holon, store: kept.store, version: kept.block!, types: typeNames(kept.holon, types) };
}

// A whole: a holon and what it holds, a layer of blocks at a time, down to a depth,
// reading but never entering what is of a type named in stop.
export async function readWhole(field: Field, root: string, stop: readonly string[], depth: number) {
  const holons: Record<string, HolonRead> = {};
  const types = new Map<string, Promise<Holon | null>>();
  const typeOf = (id: string) => {
    if (!types.has(id))
      types.set(
        id,
        keptIn(field, id).then((kept) => kept?.holon ?? null),
      );
    return types.get(id)!;
  };

  for (let layer = [root], down = 0; layer.length && down <= depth; down++) {
    const fresh = [...new Set(layer)].filter((id) => !holons[id]);
    const read = await Promise.all(fresh.map((id) => keepersOf(field, id).then(([first]) => first)));
    const next: string[] = [];

    for (const found of read) {
      if (!found) continue;

      const holon = asHolon(found.latest.version);
      const its = await Promise.all(holon.instance.map(typeOf));
      holons[holon.id] = {
        ...holon,
        store: found.key,
        version: found.latest.block,
        types: typeNames(holon, its),
      };

      const stopped = holon.id !== root && holons[holon.id]!.types.some((type) => stop.includes(type));
      if (!stopped) next.push(...partsOf(holon.body, mouldOf(its)));
    }

    layer = next;
  }

  return { root, holons };
}

// ---- What is carried

// What is read of a store is kept with the store: a store is a value, so what was read
// of it holds for every field it stands in, until it is written and becomes another.
const holonsKept = new WeakMap<object, Map<string, Promise<readonly Found[]>>>();
const logsKept = new WeakMap<object, LogEntry[]>();

// A store's holons, read whole once, under the key it is attached by.
function holonsIn({ key, store }: Attachment): Promise<readonly Found[]> {
  const byKey = holonsKept.get(store) ?? new Map<string, Promise<readonly Found[]>>();
  holonsKept.set(store, byKey);

  if (!byKey.has(key))
    byKey.set(
      key,
      store.all().then(
        (all) =>
          [...all.values()].map(({ version, block }) => ({ store: key, holon: asHolon(version), block })),
        (error) => {
          byKey.delete(key);
          throw error;
        },
      ),
    );

  return byKey.get(key)!;
}

// A store's history, read once.
async function logIn(store: object & { log(): Promise<LogEntry[]> }) {
  if (!logsKept.has(store)) logsKept.set(store, await store.log());
  return logsKept.get(store)!;
}

// Made once when first asked; a failure is not kept, so what failed for a moment can
// be asked again.
export function once<T>(make: () => Promise<T>) {
  let made: Promise<T> | undefined;

  return () =>
    (made ??= make().catch((error) => {
      made = undefined;
      throw error;
    }));
}
