// A holon connects to others from its body. A reference is written the same way
// wherever it stands, `{ "$ref": name }`, so it is seen without knowing the type.
//
// A reference holds, making the other a part, or only points. It says so itself
// with $holds, or else its key's place in the type's mould says.

import { isId, type Holon } from "../integrations/glass/store.ts";

export type Reference = { id: string; key: string; holds: boolean };

type Holdings = Readonly<Record<string, { holds?: boolean } | undefined>>;

export const isRef = (value: unknown): value is { $ref: string; $holds?: boolean } =>
  typeof value === "object" && value !== null && isId((value as { $ref?: unknown }).$ref);

// Every reference in a body, in the order the body holds them, under its top key.
export function references(body: Holon["body"], mould: Holdings = {}): Reference[] {
  const found: Reference[] = [];

  function walk(value: unknown, key: string) {
    if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
    } else if (isRef(value)) {
      found.push({ id: value.$ref, key, holds: value.$holds ?? mould[key]?.holds === true });
    } else if (typeof value === "object" && value !== null) {
      for (const inner of Object.values(value)) walk(inner, key);
    }
  }

  for (const [key, value] of Object.entries(body)) walk(value, key);

  return found;
}

// What a holon holds, as parts.
export const partsOf = (body: Holon["body"], mould: Holdings = {}) =>
  references(body, mould)
    .filter(({ holds }) => holds)
    .map(({ id }) => id);
