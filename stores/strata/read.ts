// Reading the store as of a root. Every lookup asks the layers not yet merged first,
// newest first, and then the trees; a key a layer removes is gone, whatever the trees
// say. An answer is lines of JSON, each holon's line exactly as it was written.

import type { Clause, Head, Holon, Question } from "../store.ts";
import { factsOf, isRef, type Changes, type Tree } from "./entries.ts";
import { remembered } from "./remembered.ts";
import { rootAt, type Pending, type Root } from "./root.ts";
import type { Storage } from "./storage/storage.ts";
import { between, get, keyOf, partsOf, prefixOf, within, type Entry, type Pointer } from "./tree.ts";

// A holon as strata keeps it: with where its previous version lies.
export type Version = Holon & { prev: Pointer | null };

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const newline = encoder.encode("\n");

export async function answer(storage: Storage, head: Head, question: Question): Promise<Uint8Array> {
  const root = await rootAt(storage, head.page);

  if ("holon" in question) return lines(await holonLines(storage, root, [question.holon]));

  if ("address" in question) {
    const id = await found(storage, root, "addresses", keyOf(question.address));
    return lines(await holonLines(storage, root, typeof id === "string" ? [id] : []));
  }

  if ("facts" in question) return lines((await factsFor(storage, root, question.facts)).map(json));

  if ("said" in question) {
    const { a, word } = question.said;
    const said = await foundBetween(storage, root, "words", ...prefixOf([a, word]));
    return lines(said.map(([key]) => json({ e: partsOf(key)[2], a, v: word })));
  }

  if ("versions" in question) return lines(await versionLines(storage, root, question.versions));

  return lines(await actLines(storage, head.page, question.acts.since));
}

// A tree's value for a key as of a root, or undefined where it has none.
export async function found(storage: Storage, root: Root, tree: Tree, key: string) {
  for (const pending of [...root.pending].reverse()) {
    const change = (await pendingEntries(storage, pending))[tree]?.find(([each]) => each === key);
    if (change) return change[1] === null ? undefined : change[1];
  }

  return get(storage, root.trees[tree] ?? null, key);
}

// A tree's entries from `from` up to `to` as of a root, in order.
export async function foundBetween(storage: Storage, root: Root, tree: Tree, from: string, to: string) {
  const all = new Map(await between(storage, root.trees[tree] ?? null, from, to));

  for (const pending of root.pending)
    for (const [key, value] of (await pendingEntries(storage, pending))[tree] ?? [])
      if (key >= from && key < to) value === null ? all.delete(key) : all.set(key, value);

  return [...all].sort(([a], [b]) => (a < b ? -1 : 1)) as Entry[];
}

// A pending layer's entries, its versions' pointers made to name the layer.
export function pendingEntries(storage: Storage, { layer, entries: [offset, length] }: Pending) {
  return remembered(`entries ${layer} ${offset}`, async () => {
    const changes: Changes = JSON.parse(decoder.decode(await storage.read(layer, offset, length)));
    for (const change of changes.ids ?? []) change[1] = within(change[1] as Pointer | null, layer);
    return changes;
  });
}

// The latest version of a holon as of a root, and where it lies.
export async function holonAt(storage: Storage, root: Root, id: string) {
  const pointer = (await found(storage, root, "ids", keyOf([id]))) as Pointer | undefined;
  if (!pointer) return null;
  return { pointer, version: JSON.parse(decoder.decode(await versionBytes(storage, pointer))) as Version };
}

// The wholes that hold a holon, as of a root.
export async function wholesOf(storage: Storage, root: Root, id: string): Promise<string[]> {
  const holding = await foundBetween(storage, root, "refers", ...prefixOf([id, "$holds"]));
  return holding.map(([key]) => partsOf(key)[2] as string);
}

function versionBytes(storage: Storage, [layer, offset, length]: Pointer) {
  return remembered(`version ${layer} ${offset}`, () => storage.read(layer, offset, length));
}

async function holonLines(storage: Storage, root: Root, ids: string[]) {
  const pointers = await Promise.all(ids.map((id) => found(storage, root, "ids", keyOf([id]))));
  return Promise.all(pointers.filter(Boolean).map((pointer) => versionBytes(storage, pointer as Pointer)));
}

// The facts a clause asks for, from the tree that begins with what it knows: a holon's
// own version, when its holon is known; else by value, by reference, or by attribute.
async function factsFor(storage: Storage, root: Root, { e, a, v }: Clause) {
  const matches = (fact: { a: string; v: unknown }) =>
    (a === undefined || fact.a === a) && (v === undefined || json(fact.v) === json(v));

  if (e !== undefined) {
    const held = await holonAt(storage, root, e);
    return held ? factsOf(held.version).filter(matches) : [];
  }

  if (a !== undefined && v !== undefined) {
    const entries = await foundBetween(storage, root, "value", ...prefixOf([a, v]));
    return entries.map(([key]) => ({ e: partsOf(key)[2], a, v }));
  }

  if (v !== undefined && isRef(v)) {
    const entries = await foundBetween(storage, root, "refers", ...prefixOf([v.$ref]));
    return entries.map(([key]) => ({ e: partsOf(key)[2], a: partsOf(key)[1], v }));
  }

  if (a !== undefined) {
    const entries = await foundBetween(storage, root, "attribute", ...prefixOf([a]));
    return entries.map(([key]) => ({ e: partsOf(key)[1], a, v: partsOf(key)[2] }));
  }

  throw new Error("a clause needs a holon, an attribute or a reference");
}

// A holon's versions, newest first, each line as it was written.
async function versionLines(storage: Storage, root: Root, id: string) {
  const all: Uint8Array[] = [];
  let pointer = (await found(storage, root, "ids", keyOf([id]))) as Pointer | null | undefined;

  while (pointer) {
    const bytes = await versionBytes(storage, pointer);
    all.push(bytes);
    pointer = (JSON.parse(decoder.decode(bytes)) as Version).prev;
  }

  return all;
}

// The acts from a head back to the one named since, newest first, compaction's roots left
// out.
async function actLines(storage: Storage, page: string, since: string | undefined) {
  const acts: Uint8Array[] = [];
  let name: string | null = page;

  while (name) {
    const root: Root = await rootAt(storage, name);
    if (root.act === since) break;
    if (!root.pressed)
      acts.push(json({ hash: root.act, at: root.at, says: root.says, touches: root.touches }));
    name = root.previous;
  }

  return acts;
}

function json(value: unknown) {
  return encoder.encode(JSON.stringify(value));
}

function lines(all: Uint8Array[]) {
  const joined = new Uint8Array(all.reduce((sum, line) => sum + line.length + 1, 0));
  let at = 0;

  for (const line of all) {
    joined.set(line, at);
    joined.set(newline, at + line.length);
    at += line.length + 1;
  }

  return joined;
}
