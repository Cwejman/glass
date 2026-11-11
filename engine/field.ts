// The field is the stores an engine holds, read as one, held as a value: an attach
// or a commit makes the next one. One holon, or one whole with what it holds, costs
// a few blocks. Only a question about everything fetches everything, and then once.

import { asHolon, type Holon, type Store } from "../integrations/glass/store.ts";
import type { Source } from "../integrations/source.ts";
import {
  everythingOf,
  expressionProblem,
  gather,
  groups,
  level,
  type Everything,
  type Known,
} from "./expression.ts";
import { kernel, kernelOf, plain, type Expr } from "./kernel.ts";
import { mouldOf, type Mould } from "./moulds.ts";
import { idsIn, type Answer, type HolonRead, type Read, type Whole } from "./reads.ts";
import { partsOf } from "./references.ts";

// A store as this engine uses it: what it is called here, and whether it may be written.
// One it reads is any source; one it writes is glass's own store.
export type Attached =
  | { key: string; store: Source; write?: false }
  | { key: string; store: Store; write: true };

export type Writable = Extract<Attached, { write: true }>;

export const isWritable = (attached: Attached): attached is Writable => attached.write === true;

export type Field = {
  stores: readonly Attached[];
  everything: () => Promise<Everything>;
  storeHolons: (key: string) => Promise<Known[]>;
};

const once = <T>(make: () => Promise<T>) => {
  let made: Promise<T> | undefined;

  return () => {
    // A failure is not kept, so what failed for a moment can be asked again.
    made ??= make().catch((error) => {
      made = undefined;
      throw error;
    });

    return made;
  };
};

// What each store holds is asked once, and carried over to the next field.
export function fieldOf(stores: readonly Attached[], before?: Field): Field {
  const carried = new Map<string, () => Promise<Known[]>>();

  const ofStore = ({ key, store }: Attached) =>
    once(async () =>
      [...(await store.all()).values()].map(({ version }) => ({ store: key, holon: asHolon(version) })),
    );

  for (const attached of stores) {
    const same = before?.stores.find(({ key, store }) => key === attached.key && store === attached.store);

    carried.set(attached.key, same ? () => before!.storeHolons(attached.key) : ofStore(attached));
  }

  const storeHolons = (key: string) => carried.get(key)?.() ?? Promise.resolve([]);

  const everything = once(async () => {
    const held = await Promise.all(stores.map(({ key }) => storeHolons(key)));
    const known = new Map<string, Known>();

    // A holon two stores claim is the first's, as when one is read alone.
    for (const each of held.flat()) if (!known.has(each.holon.id)) known.set(each.holon.id, each);

    return everythingOf(known);
  });

  return { stores, everything, storeHolons };
}

// Every attached store that keeps a holon now, in the order they were attached: those
// that may hold its id, asked whether they do.
export async function keepersOf(field: Field, id: string) {
  const asked = await Promise.all(
    field.stores
      .filter(({ store }) => store.mayHold(id))
      .map(async (attached) => ({ attached, latest: await attached.store.read(id) })),
  );

  return asked.flatMap(({ attached, latest }) => (latest ? [{ ...attached, latest }] : []));
}

// A holon as the first store that keeps it has it.
async function find(field: Field, id: string) {
  const [first] = await keepersOf(field, id);
  return first ? { key: first.key, ...first.latest } : null;
}

export async function holonOf(field: Field, id: string) {
  const found = await find(field, id);
  return found && asHolon(found.version);
}

// The names of what a holon is. A holon is a type by having a mould.
const typeNames = (holon: Holon, types: (Holon | null)[]) => [
  ...(holon.mould ? ["type"] : []),
  ...types.flatMap((type) => (type?.name ? [type.name] : [])),
];

async function viewOf(field: Field, key: string, block: string, holon: Holon): Promise<HolonRead> {
  const types = await Promise.all(holon.instance.map((type) => holonOf(field, type)));

  return { ...holon, store: key, version: block, types: typeNames(holon, types) };
}

async function readHolon(field: Field, id: string) {
  const found = await find(field, id);
  return found ? viewOf(field, found.key, found.block, asHolon(found.version)) : null;
}

// A holon and everything it holds, layer by layer, so a brief drawn by its words is
// one read, however many holons it is. Holons of the types it is told to stop at are
// read, and not gone into, so a whole can show what it holds without fetching all of it;
// a depth stops it as many layers down, so one level of the holarchy is one read.
async function readWhole(
  field: Field,
  root: string,
  stop: string[] = [],
  depth = Number.POSITIVE_INFINITY,
): Promise<Whole> {
  const holons: Whole["holons"] = {};
  const moulds = new Map<string, Promise<Holon | null>>();

  const typeOf = (type: string) => {
    if (!moulds.has(type)) moulds.set(type, holonOf(field, type));
    return moulds.get(type)!;
  };

  for (let layer = [root], down = 0; layer.length && down <= depth; down++) {
    const fresh = [...new Set(layer)].filter((id) => !holons[id]);
    const read = await Promise.all(fresh.map((id) => find(field, id)));
    const next: string[] = [];

    for (const found of read) {
      if (!found) continue;

      const holon = asHolon(found.version);
      const types = await Promise.all(holon.instance.map(typeOf));

      holons[holon.id] = { ...holon, store: found.key, version: found.block, types: typeNames(holon, types) };

      const stopped = holon.id !== root && holons[holon.id]!.types.some((type) => stop.includes(type));

      if (!stopped) {
        next.push(...partsOf(holon.body, mouldOf(types.map((type) => type?.mould as Mould | undefined))));
      }
    }

    layer = next;
  }

  return { root, holons };
}

// Everything the field holds, with each store's log where an expression asks of
// history: fetched only then.
async function withHistory(field: Field, all: Everything, expression: unknown): Promise<Everything> {
  const asksOfHistory = idsIn(expression).some((id) =>
    ["log", "since"].includes(
      String((all.known.get(id)?.holon.body as { native?: unknown } | undefined)?.native),
    ),
  );
  if (!asksOfHistory) return all;

  const logs = new Map(
    await Promise.all(field.stores.map(async ({ key, store }) => [key, await store.log()] as const)),
  );

  return { ...all, logs };
}

// What an expression gives, worked out over everything the field holds.
async function valueOf(field: Field, all: Everything, expression: Expr) {
  const problem = expressionProblem(expression);
  if (problem) throw new Error(problem);

  return plain(kernelOf(await withHistory(field, all, expression)).evaluate(expression));
}

async function answer(field: Field, query: Read): Promise<unknown> {
  if ("holon" in query) return readHolon(field, query.holon);
  if ("whole" in query) return readWhole(field, query.whole, query.stop, query.depth);

  if ("log" in query) {
    const attached = field.stores.find(({ key }) => key === query.log);
    return attached ? attached.store.log() : null;
  }

  if ("versions" in query) {
    const [first] = await keepersOf(field, query.versions);
    return first ? first.store.versions(query.versions) : [];
  }

  if ("named" in query || "instances" in query) {
    const matches = ({ holon }: Known) =>
      "named" in query ? holon.name === query.named : holon.instance.includes(query.instances);
    const held = query.store
      ? await field.storeHolons(query.store)
      : [...(await field.everything()).known.values()];

    return held.filter(matches).map(({ holon }) => holon.id);
  }

  const all = await field.everything();

  if ("gather" in query) return gather(await withHistory(field, all, query.gather), query.gather);
  if ("level" in query) return level(await withHistory(field, all, query.level), query.level);
  if ("groups" in query) return groups(await withHistory(field, all, query.groups), query.groups);
  if ("value" in query) return valueOf(field, all, query.value);

  return all.holders.get(query.holders) ?? [];
}

export const read = <R extends Read>(field: Field, query: R) => answer(field, query) as Promise<Answer<R>>;
