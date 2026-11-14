// What a holon puts in strata's trees, other than where its latest version lies: its
// facts, by attribute, by value and, for references, by what they refer to; and the
// words of its text, by attribute.
//
// A fact is one value a holon has under a key: each type it is an instance of, under
// instance; its name, under name; and each value its body holds under a key, an array
// giving one fact for each element. Values are strings, numbers, booleans and
// references; a record that is not a reference gives no fact. A reference that holds
// gives a second fact, under $holds.

import type { Fact, Holon, Value } from "../store.ts";
import { keyOf, type Change } from "./tree.ts";

// The trees strata keeps, each named by what its keys begin with.
export const trees = ["ids", "addresses", "attribute", "value", "refers", "words"] as const;
export type Tree = (typeof trees)[number];

export type Changes = Partial<Record<Tree, Change[]>>;

export function factsOf(holon: Holon): Fact[] {
  const facts: Fact[] = holon.instance.map((type) => ({ e: holon.id, a: "instance", v: { $ref: type } }));
  if (holon.name !== undefined) facts.push({ e: holon.id, a: "name", v: holon.name });

  for (const [a, held] of Object.entries(holon.body))
    for (const each of Array.isArray(held) ? held : [held]) {
      const v = valueOf(each);
      if (v === undefined) continue;

      facts.push({ e: holon.id, a, v });
      if (holds(each)) facts.push({ e: holon.id, a: "$holds", v });
    }

  return facts;
}

// The entries a holon's facts make, in every tree but ids and addresses, each set to
// true; the same keys set to null remove them.
export function factEntries(holon: Holon, value: true | null = true): Changes {
  const changes: Changes = { attribute: [], value: [], refers: [], words: [] };

  for (const { e, a, v } of factsOf(holon)) {
    changes.attribute!.push([keyOf([a, e, v]), value]);
    changes.value!.push([keyOf([a, v, e]), value]);
    if (isRef(v)) changes.refers!.push([keyOf([v.$ref, a, e]), value]);
    if (typeof v === "string")
      for (const word of wordsOf(v)) changes.words!.push([keyOf([a, word, e]), value]);
  }

  return changes;
}

// The words of a text, as a search finds them: letters and digits only, lower case,
// accents taken off.
export function wordsOf(text: string): string[] {
  const plain = text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  return [...new Set(plain.match(/[\p{L}\p{N}]+/gu) ?? [])];
}

// The ids a holon holds, in the order its body holds them.
export function heldBy(holon: Holon): string[] {
  return Object.values(holon.body)
    .flatMap((held) => (Array.isArray(held) ? held : [held]))
    .filter(holds)
    .map((ref) => ref.$ref);
}

export const isRef = (value: unknown): value is { $ref: string } =>
  value !== null && typeof value === "object" && typeof (value as { $ref?: unknown }).$ref === "string";

const holds = (value: unknown): value is { $ref: string; $holds: true } =>
  isRef(value) && (value as { $holds?: unknown }).$holds === true;

function valueOf(value: unknown): Value | undefined {
  if (isRef(value)) return { $ref: value.$ref };
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return undefined;
}
