// What may be asked of the field, and what each asking answers. This is the one
// place that says, for the engine that answers and the interface that asks.

import { isId, type Holon, type LogEntry, type Version } from "../integrations/glass/store.ts";
import type { Expression, Grouped, Holder } from "./expression.ts";
import type { Expr, Value } from "./kernel.ts";

// A holon as an engine answers: where it stands, its version's block, and the names
// of what it is, so a reader need not ask for them.
export type HolonRead = Holon & { store: string; version: string; types: string[] };

export type Whole = { root: string; holons: Record<string, HolonRead> };

export type Read =
  | { holon: string }
  | { whole: string; stop?: string[]; depth?: number }
  | { named: string; store?: string }
  | { instances: string; store?: string }
  | { holders: string }
  | { log: string }
  | { versions: string }
  | { gather: Expression }
  | { level: Expression }
  | { groups: Expression }
  | { value: Expr };

// What a way of looking that gives no set is refused with, so a reader can read it as a
// value instead.
export const notASet = "what is looked at is a set of holons, and this gives something else";

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
            : R extends { value: Expr }
              ? Value
              : string[];

// The word a read goes by: what it asks, apart from what narrows it.
export const formOf = (query: Read) =>
  Object.keys(query).find((key) => !["store", "stop", "depth"].includes(key))!;

// The holons a value names: ids standing alone or as references.
export function idsIn(value: unknown): string[] {
  if (isId(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(idsIn);
  if (typeof value !== "object" || value === null) return [];

  return Object.values(value).flatMap(idsIn);
}

// The holons a read asks about.
export function askedOf(query: Read) {
  if ("holon" in query) return [query.holon];
  if ("whole" in query) return [query.whole];
  if ("holders" in query) return [query.holders];
  if ("instances" in query) return [query.instances];
  if ("gather" in query) return idsIn(query.gather);
  if ("level" in query) return idsIn(query.level);
  if ("groups" in query) return idsIn(query.groups);
  if ("value" in query) return idsIn(query.value);

  return [];
}
