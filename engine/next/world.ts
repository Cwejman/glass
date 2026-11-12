// The world is the field as an expression works over it: every holon attached, read
// once, in the field's order, with what refers to each, where each resides, and an
// index for patterns, made when a pattern first asks. It is a value of one field.

import type { Holon, LogEntry } from "../../integrations/glass/store.ts";
import type { Field } from "./field.ts";
import { mouldOf, references, type Mould } from "./moulds.ts";
import { indexFor } from "./patterns/index.ts";
import type { Answering } from "./patterns/facts.ts";

// A holon as a store keeps it: where, and the block that holds its latest version.
export type Kept = { store: string; holon: Holon; block?: string };

// What refers to a holon: from which holon, under which key, and whether it holds it.
export type Holder = { from: string; key: string; holds: boolean };

export type World = {
  stores: readonly string[];
  // Every holon, each once, read from the first store keeping it, in the field's order.
  known: ReadonlyMap<string, Kept>;
  // Each store's holons as it keeps them.
  held: ReadonlyMap<string, readonly Kept[]>;
  place: ReadonlyMap<string, number>;
  holders(id: string): readonly Holder[];
  // The stores a holon resides in, the first the one it is read from.
  storesOf(id: string): readonly string[];
  mouldFor(holon: Holon): Mould;
  index(): Answering;
  // A store's history, where it has been read; otherwise the read lacks it.
  log(key: string): LogEntry[];
  field: Field;
};

// What a read lacks to be answered: a store's history not yet read. The read is given
// it and worked out again.
export type Lack = { lacks: { log: string } };
export const isLack = (value: unknown): value is Lack =>
  typeof value === "object" && value !== null && "lacks" in value;

export function worldOf(field: Field, heldByStore: readonly (readonly Kept[])[]): World {
  const stores = field.stores.map(({ key }) => key);
  const held = new Map(stores.map((key, i) => [key, heldByStore[i]!]));

  const known = new Map<string, Kept>();
  const residences = new Map<string, string[]>();

  for (const [key, list] of held)
    for (const each of list) {
      const first = known.get(each.holon.id);
      if (!first) known.set(each.holon.id, each);
      else {
        const stores = residences.get(each.holon.id) ?? [first.store];
        stores.push(key);
        residences.set(each.holon.id, stores);
      }
    }

  const mouldFor = (holon: Holon) => mouldOf(holon.instance.map((type) => known.get(type)?.holon));

  const holders = new Map<string, Holder[]>();
  for (const { holon } of known.values())
    for (const { id, key, holds } of references(holon.body, mouldFor(holon))) {
      const list = holders.get(id) ?? [];
      list.push({ from: holon.id, key, holds });
      holders.set(id, list);
    }

  let index: Answering | undefined;

  const world: World = {
    stores,
    known,
    held,
    place: new Map([...known.keys()].map((id, i) => [id, i])),
    holders: (id) => holders.get(id) ?? [],
    storesOf: (id) => residences.get(id) ?? (known.has(id) ? [known.get(id)!.store] : []),
    mouldFor,
    index: () => (index ??= indexFor(world)),
    log(key) {
      const log = logsRead.get(field)?.get(key);
      if (!log) throw { lacks: { log: key } } satisfies Lack;
      return log;
    },
    field,
  };

  return world;
}

// The histories a field's reads have needed, read once each.
const logsRead = new WeakMap<Field, Map<string, LogEntry[]>>();

export async function readLog(field: Field, key: string) {
  const logs = logsRead.get(field) ?? new Map<string, LogEntry[]>();
  logsRead.set(field, logs);

  const attachment = field.stores.find((one) => one.key === key);
  logs.set(key, attachment ? await attachment.store.log() : []);
}
