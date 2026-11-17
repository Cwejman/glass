// What strata's index holds, and how its keys are made. Each entry belongs to one tree,
// named by what its keys begin with: where each holon's version lies, by id; which holon
// a whole holds under a name, by address; a holon's facts, by attribute and value and,
// for references, by what they refer to; the words of its text, by attribute; and the
// acts the store took, by content hash, each stamped with its number.
//
// A fact is one value a holon has under a key: each type it is an instance of, under
// instance; its name, under name; and each value its body holds under a key: a string,
// number or boolean at the top or as an element of an array, and a reference at any
// depth, within records and arrays alike, as an expression kept in a body refers. A
// reference that holds gives a second fact, under $holds.

import type { Fact, Holon, Value } from "../store.ts";
import { compare, type Entry } from "./run.ts";

export const trees = ["ids", "addresses", "value", "refers", "words", "acts"] as const;
export type Tree = (typeof trees)[number];

// Where a version lies: its part, and the offset and length of its line there.
export type Pointer = [part: string, offset: number, length: number];

// A change to a key: its value, or null where the key is removed. A fact or a word has
// no value but its presence, true.
export type Change = [key: string, value: unknown | null];
export type Changes = Partial<Record<Tree, Change[]>>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ---- Keys

// A key made of parts. Each part is JSON, which never holds a raw \u0000, so the
// separator sorts below anything a part can hold. A long string stands as its beginning
// and a hash of the whole, so every key stays short; whoever reads such a part back reads
// the whole string from the holon.
export function keyOf(parts: unknown[]): string {
  return parts.map((part) => JSON.stringify(shortened(part))).join("\u0000");
}

// The longest string a key holds whole, as JSON in UTF-16 code units, and how much of a
// longer one it keeps, so every key fits in a run's page.
const longest = 256;
const kept = 64;

export type Long = { $long: string; $hash: string };

const shortened = (part: unknown) =>
  typeof part === "string" && JSON.stringify(part).length > longest
    ? ({ $long: part.slice(0, kept), $hash: fnv(part) } as Long)
    : part;

export const isLong = (part: unknown): part is Long =>
  part !== null && typeof part === "object" && typeof (part as Long).$long === "string";

// Whether a value is the one a long part stands for.
export const standsFor = (part: Long, value: unknown) =>
  JSON.stringify(shortened(value)) === JSON.stringify(part);

// A hash of a string's code units, as 16 hex digits: two 32-bit FNV-1a hashes begun from
// different offsets. A long string found by it is always checked against the holon's.
function fnv(text: string) {
  let [a, b] = [0x811c9dc5, 0x050c5d1f];
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    a = Math.imul(a ^ unit, 0x01000193) >>> 0;
    b = Math.imul(b ^ unit, 0x01000193) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

// The keys beginning with these parts: from the key they make, up to but not including
// that key followed by \u0001.
export function prefixOf(parts: unknown[]): [from: string, to: string] {
  const key = keyOf(parts);
  return [key, key + "\u0001"];
}

export function partsOf(key: string): unknown[] {
  return key.split("\u0000").map((part) => JSON.parse(part));
}

// A key as a run keeps it: its tree's number, then the key in UTF-8.
export function keyBytes(tree: Tree, key: string): Uint8Array {
  const text = encoder.encode(key);
  const bytes = new Uint8Array(text.length + 1);
  bytes[0] = trees.indexOf(tree);
  bytes.set(text, 1);
  return bytes;
}

export const keyText = (bytes: Uint8Array) => decoder.decode(bytes.subarray(1));

// ---- Values

// A tree's value as a run keeps it: a pointer as its part's 32 bytes of hash, then its
// offset and length; an id as its text; a fact, a word or an act as nothing.
export function valueBytes(tree: Tree, value: unknown): Uint8Array {
  if (tree === "ids") {
    const [part, offset, length] = value as Pointer;
    const bytes = new Uint8Array(40);
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(part.slice(i * 2, i * 2 + 2), 16);
    new DataView(bytes.buffer).setUint32(32, offset);
    new DataView(bytes.buffer).setUint32(36, length);
    return bytes;
  }
  if (tree === "addresses") return encoder.encode(value as string);
  return new Uint8Array(0);
}

const hex = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, "0"));

export function valueFrom(tree: Tree, bytes: Uint8Array): unknown {
  if (tree === "ids") {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let part = "";
    for (let i = 0; i < 32; i++) part += hex[bytes[i]!];
    return [part, view.getUint32(32), view.getUint32(36)] as Pointer;
  }
  if (tree === "addresses") return decoder.decode(bytes);
  return true;
}

// An act's changes as the entries of its run, sorted by key.
export function entriesOf(changes: Changes): Entry[] {
  const entries: Entry[] = [];

  for (const [tree, list] of Object.entries(changes) as [Tree, Change[]][])
    for (const [key, value] of list)
      entries.push({
        key: keyBytes(tree, key),
        act: 0,
        value: value === null ? null : valueBytes(tree, value),
      });

  return entries.sort((a, b) => compare(a.key, b.key));
}

// ---- Facts

export function factsOf(holon: Holon): Fact[] {
  const facts: Fact[] = holon.instance.map((type) => ({ e: holon.id, a: "instance", v: { $ref: type } }));
  if (holon.name !== undefined) facts.push({ e: holon.id, a: "name", v: holon.name });

  // References at any depth beneath a key.
  const refersUnder = (a: string, value: unknown) => {
    if (isRef(value)) {
      facts.push({ e: holon.id, a, v: { $ref: value.$ref } });
      if (holds(value)) facts.push({ e: holon.id, a: "$holds", v: { $ref: value.$ref } });
    } else if (Array.isArray(value)) for (const each of value) refersUnder(a, each);
    else if (typeof value === "object" && value !== null)
      for (const inner of Object.values(value)) refersUnder(a, inner);
  };

  for (const [a, held] of Object.entries(holon.body)) {
    refersUnder(a, held);
    for (const each of Array.isArray(held) ? held : [held]) {
      const v = valueOf(each);
      if (v !== undefined && !isRef(v)) facts.push({ e: holon.id, a, v });
    }
  }

  return facts;
}

// What a holon's new version changes in the trees of facts and words, against the
// version before it: the keys only the old one had are removed, set to null; the keys
// only the new one has are set to true; keys both have are left as they are. A holon
// written for the first time has no version before; one let go has none after.
export function factChanges(before: Holon | null, after: Holon | null): Changes {
  const [was, is] = [keysOf(before), keysOf(after)];
  const changes: Changes = {};

  for (const tree of ["value", "refers", "words"] as const) {
    const removed = [...was[tree]].filter((key) => !is[tree].has(key)).map((key): Change => [key, null]);
    const added = [...is[tree]].filter((key) => !was[tree].has(key)).map((key): Change => [key, true]);
    if (removed.length || added.length) changes[tree] = [...removed, ...added];
  }

  return changes;
}

// Every key a holon's facts and words make, tree by tree.
function keysOf(holon: Holon | null) {
  const keys = {
    value: new Set<string>(),
    refers: new Set<string>(),
    words: new Set<string>(),
  };
  if (!holon) return keys;

  for (const { e, a, v } of factsOf(holon)) {
    keys.value.add(keyOf([a, v, e]));
    if (isRef(v)) keys.refers.add(keyOf([v.$ref, a, e]));
    if (typeof v === "string") for (const word of wordsOf(v)) keys.words.add(keyOf([a, word, e]));
  }

  return keys;
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
