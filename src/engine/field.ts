// The field is the stores an engine holds, read as one, held as a value: an attach
// or a commit makes the next one. One holon, or one whole with what it holds, costs
// a few blocks. Only a question about everything fetches everything, and then once.

import type { Holon, Store } from "../store/store.ts";
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

export type Attached = { key: string; store: Store };

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

const strip = ({ prev: _, ...holon }: Holon & { prev?: unknown }): Holon => holon;

// What each store holds is asked once, and carried over to the next field.
export function fieldOf(stores: readonly Attached[], before?: Field): Field {
  const carried = new Map<string, () => Promise<Known[]>>();

  const ofStore = ({ key, store }: Attached) =>
    once(async () =>
      [...(await store.all()).values()].map(({ version }) => ({ store: key, holon: strip(version) })),
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

// The store that holds an id, known without fetching anything.
const standing = (field: Field, id: string) => field.stores.find(({ store }) => store.mayHold(id));

async function find(field: Field, id: string) {
  const attached = standing(field, id);
  const latest = attached && (await attached.store.read(id));

  return latest ? { key: attached.key, ...latest } : null;
}

export async function holonOf(field: Field, id: string) {
  const found = await find(field, id);
  return found && strip(found.version);
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
  return found ? viewOf(field, found.key, found.block, strip(found.version)) : null;
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

      const holon = strip(found.version);
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

// What an expression gives, worked out over everything the field holds. Each store's
// history is fetched only for an expression that asks of it.
async function valueOf(field: Field, all: Everything, expression: Expr) {
  const problem = expressionProblem(expression);
  if (problem) throw new Error(problem);

  const asksOfHistory = idsIn(expression).some(
    (id) => (all.known.get(id)?.holon.body as { native?: unknown } | undefined)?.native === "log",
  );
  if (!asksOfHistory) return plain(kernelOf(all).evaluate(expression));

  const logs = new Map(
    await Promise.all(field.stores.map(async ({ key, store }) => [key, await store.log()] as const)),
  );

  return plain(kernel({ all, logs }).evaluate(expression));
}

async function answer(field: Field, query: Read): Promise<unknown> {
  if ("holon" in query) return readHolon(field, query.holon);
  if ("whole" in query) return readWhole(field, query.whole, query.stop, query.depth);

  if ("log" in query) {
    const attached = field.stores.find(({ key }) => key === query.log);
    return attached ? attached.store.log() : null;
  }

  if ("versions" in query) {
    const attached = standing(field, query.versions);
    return attached ? attached.store.versions(query.versions) : [];
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

  if ("gather" in query) return gather(all, query.gather);
  if ("level" in query) return level(all, query.level);
  if ("groups" in query) return groups(all, query.groups);
  if ("value" in query) return valueOf(field, all, query.value);

  return all.holders.get(query.holders) ?? [];
}

export const read = <R extends Read>(field: Field, query: R) => answer(field, query) as Promise<Answer<R>>;
