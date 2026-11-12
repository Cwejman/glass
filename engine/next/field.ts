// The field is the stores an engine has attached, read as one: a value, made anew by
// every attach, detach, act and store moved. One holon, or one whole with what it holds,
// costs a few blocks. A question over the field reads each store whole, once, and what
// was read is carried to the next field wherever its store is unchanged.

import { asHolon, type Holon, type Store } from "../../integrations/glass/store.ts";
import type { Source } from "../../integrations/source.ts";
import { worldOf, type Kept, type World } from "./world.ts";
import type { Shelf } from "./patterns/index.ts";

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
  holonsOf(key: string): Promise<readonly Kept[]>;
  // Everything attached, read as one, once.
  world(): Promise<World>;
  // Each store's index as last made, the same shelf from field to field, so an index is
  // patched from the one before rather than made again.
  shelf: Shelf;
};

export const fieldOf = (stores: readonly Attachment[], before?: Field): Field => {
  const shelf: Shelf = before?.shelf ?? new Map();
  const readers = new Map(stores.map((attachment) => [attachment.key, readerOf(attachment, before)]));
  const holonsOf = (key: string) => readers.get(key)?.() ?? Promise.resolve([]);

  const field: Field = {
    stores,
    holonsOf,
    shelf,
    world: once(async () => worldOf(field, await Promise.all(stores.map(({ key }) => holonsOf(key))))),
  };

  readersOf.set(field, readers);
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
    field.stores.map((one) => (now.has(one.key) ? ({ ...one, store: now.get(one.key)! } as Attachment) : one)),
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
export async function keptIn(field: Field, id: string): Promise<Kept | null> {
  const [first] = await keepersOf(field, id);
  return first ? { store: first.key, holon: asHolon(first.latest.version), block: first.latest.block } : null;
}

export const holonOf = async (field: Field, id: string): Promise<Holon | null> =>
  (await keptIn(field, id))?.holon ?? null;

// ---- What is carried

const readersOf = new WeakMap<Field, Map<string, () => Promise<readonly Kept[]>>>();

// How a store's holons are read: carried from the field before where the store is the
// very one it was, read afresh where it is new or has moved.
function readerOf(attachment: Attachment, before?: Field) {
  const was = before?.stores.find(({ key }) => key === attachment.key);
  const carried = was?.store === attachment.store ? readersOf.get(before!)?.get(attachment.key) : undefined;

  return (
    carried ??
    once(async () =>
      [...(await attachment.store.all()).values()].map(({ version, block }) => ({
        store: attachment.key,
        holon: asHolon(version),
        block,
      })),
    )
  );
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
