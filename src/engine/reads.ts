// What may be asked of the field, and what each asking answers. This is the one
// place that says, for the engine that answers and the interface that asks.

import { isName, type Holon, type LogEntry, type Version } from "../store/store.ts";
import type { Expression, Grouped, Holder } from "./expression.ts";

// A holon as an engine answers: where it stands, its version's block, and the names
// of what it is, so a reader need not ask for them.
export type HolonRead = Holon & { store: string; version: string; types: string[] };

export type Whole = { root: string; holons: Record<string, HolonRead> };

export type Read =
  | { holon: string }
  | { whole: string; stop?: string[] }
  | { named: string; store?: string }
  | { instances: string; store?: string }
  | { holders: string }
  | { log: string }
  | { versions: string }
  | { gather: Expression }
  | { groups: Expression };

export type Answer<R extends Read> = R extends { holon: string }
  ? HolonRead | null
  : R extends { whole: string }
    ? Whole
    : R extends { holders: string }
      ? readonly Holder[]
      : R extends { log: string }
        ? LogEntry[] | null
        : R extends { versions: string }
          ? Version[]
          : R extends { groups: Expression }
            ? Grouped | null
            : string[];

// The word a read goes by: what it asks, apart from what narrows it.
export const formOf = (query: Read) => Object.keys(query).find((key) => key !== "store" && key !== "stop")!;

// The holons a value names: names standing alone or as references.
export function namesIn(value: unknown): string[] {
  if (isName(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(namesIn);
  if (typeof value !== "object" || value === null) return [];

  return Object.values(value).flatMap(namesIn);
}

// The holons a read asks about.
export function askedOf(query: Read) {
  if ("holon" in query) return [query.holon];
  if ("whole" in query) return [query.whole];
  if ("holders" in query) return [query.holders];
  if ("instances" in query) return [query.instances];
  if ("gather" in query) return namesIn(query.gather);
  if ("groups" in query) return namesIn(query.groups);

  return [];
}
