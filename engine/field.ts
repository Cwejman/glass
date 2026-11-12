// The field is the stores an engine has attached, read as one: a value, made anew by
// every attach, detach, act and store moved. One holon, or one whole with what it holds,
// costs a few blocks. A question over the field reads each store whole, once, and what
// was read is carried to the next field wherever its store is unchanged.

import { asHolon, type Holon, type LogEntry, type Store } from "../integrations/glass/store.ts";
import type { Source } from "../integrations/source.ts";
import { worldOf, type Found, type World } from "./world.ts";
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
  const readers = new Map(
    stores.map((attachment) => [attachment.key, carried(attachment, before, readersOf, holonsIn)]),
  );
  const histories = new Map(
    stores.map((attachment) => [attachment.key, carried(attachment, before, historiesOf, logIn)]),
  );
  const read = new Map<string, LogEntry[]>(
    stores.flatMap(({ key }) =>
      histories.get(key) === historiesOf.get(before!)?.get(key) && before?.logsRead(key)
        ? [[key, before.logsRead(key)!]]
        : [],
    ),
  );
  const holonsOf = (key: string) => readers.get(key)?.() ?? Promise.resolve([]);

  const field: Field = {
    stores,
    holonsOf,
    shelf,
    logOf: async (key) => {
      const log = (await histories.get(key)?.()) ?? [];
      read.set(key, log);
      return log;
    },
    logsRead: (key) => read.get(key),
    world: once(async () =>
      worldOf({
        stores: stores.map(({ key }) => key),
        byStore: await Promise.all(stores.map(({ key }) => holonsOf(key))),
        logs: (key) => read.get(key),
        shelf,
      }),
    ),
  };

  readersOf.set(field, readers);
  historiesOf.set(field, histories);
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

// ---- What is carried

type Reading<T> = () => Promise<T>;
const readersOf = new WeakMap<Field, Map<string, Reading<readonly Found[]>>>();
const historiesOf = new WeakMap<Field, Map<string, Reading<LogEntry[]>>>();

// How something of a store is read: carried from the field before where the store is the
// very one it was, read afresh, once, where it is new or has moved.
function carried<T>(
  attachment: Attachment,
  before: Field | undefined,
  readings: WeakMap<Field, Map<string, Reading<T>>>,
  read: (attachment: Attachment) => Promise<T>,
): Reading<T> {
  const was = before?.stores.find(({ key }) => key === attachment.key);
  const same = was?.store === attachment.store ? readings.get(before!)?.get(attachment.key) : undefined;

  return same ?? once(() => read(attachment));
}

const holonsIn = async ({ key, store }: Attachment): Promise<readonly Found[]> =>
  [...(await store.all()).values()].map(({ version, block }) => ({
    store: key,
    holon: asHolon(version),
    block,
  }));

const logIn = ({ store }: Attachment) => store.log();

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
