// Reading the store as of a head, through the runs the head has now. A key's value is
// the newest entry for it stamped with the head's act or one before; runs are searched
// newest first, so the first that has one answers. A key that entry removes is gone. An
// answer is lines of JSON, each holon's line exactly as it was written.
//
// A run read here may be merged and removed by compaction, in this process or another,
// before the read reaches it; the read then begins again, from the runs the store has now.

import type { Clause, Fact, Head, Holon, Question, Value } from "../store.ts";
import {
  factsOf,
  isLong,
  isRef,
  keyBytes,
  keyOf,
  keyText,
  partsOf,
  prefixOf,
  standsFor,
  valueFrom,
  type Pointer,
  type Tree,
} from "./entries.ts";
import { commitAt, headAt, viewAt, type View } from "./head.ts";
import { entriesFor, valueIn, valuesIn } from "./run.ts";
import type { Storage } from "./storage/storage.ts";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const newline = encoder.encode("\n");

export function answer(storage: Storage, head: Head, question: Question): Promise<Uint8Array> {
  return afresh(async () => answerAt(storage, head, (await viewAt(storage, head))!, question));
}

// Work over the index, begun again from the runs the store has now if a run it read was
// removed under it, up to three times.
export async function afresh<T>(work: () => Promise<T>): Promise<T> {
  for (let tries = 1; ; tries++)
    try {
      return await work();
    } catch (error) {
      if (tries === 3) throw error;
    }
}

async function answerAt(storage: Storage, head: Head, view: View, question: Question) {
  if ("holon" in question) return lines(await holonLines(storage, view, [question.holon]));

  if ("address" in question) {
    const id = await found(storage, view, "addresses", keyOf(question.address));
    return lines(await holonLines(storage, view, typeof id === "string" ? [id] : []));
  }

  if ("facts" in question) return lines((await factsFor(storage, view, question.facts)).map(json));

  if ("said" in question) {
    const { a, word } = question.said;
    const said = await foundBetween(storage, view, "words", ...prefixOf([a, word]));
    return lines(said.map(([key]) => json({ e: partsOf(key)[2], a, v: word })));
  }

  if ("versions" in question) return lines(await versionLines(storage, view, question.versions));

  if ("act" in question) {
    const taken = await stamps(storage, view, "acts", keyOf([question.act]));
    return lines(taken.map(({ act }) => json({ act: question.act, number: act })));
  }

  return lines(await actLines(storage, head.commit, question.acts.since));
}

// A tree's value for a key as of a view, or undefined where it has none.
export async function found(storage: Storage, view: View | null, tree: Tree, key: string) {
  if (!view) return undefined;
  const bytes = keyBytes(tree, key);

  for (const run of view.runs) {
    const value = await valueIn(storage, run, bytes, view.upTo);
    if (value === null) return undefined;
    if (value !== undefined) return valueFrom(tree, value);
  }

  return undefined;
}

// Every entry for a key as of a view, in every run, newest first: the acts that set it or
// took it away.
export async function stamps(storage: Storage, view: View | null, tree: Tree, key: string) {
  if (!view) return [];
  const bytes = keyBytes(tree, key);
  const all = await Promise.all(view.runs.map((run) => entriesFor(storage, run, bytes, view.upTo)));
  return all.flat().sort((a, b) => b.act - a.act);
}

// A tree's keys from `from` up to `to` as of a view, with their values, in order.
export async function foundBetween(
  storage: Storage,
  view: View | null,
  tree: Tree,
  from: string,
  to: string,
) {
  if (!view) return [];
  const all = new Map<string, unknown | null>();
  const [low, high] = [keyBytes(tree, from), keyBytes(tree, to)];

  // Oldest run first, so a newer run's entry replaces an older one's.
  for (const run of [...view.runs].reverse())
    for (const [key, value] of await valuesIn(storage, run, low, high, view.upTo))
      all.set(keyText(key), value === null ? null : valueFrom(tree, value));

  return [...all].filter(([, value]) => value !== null).sort(([a], [b]) => (a < b ? -1 : 1)) as [
    string,
    unknown,
  ][];
}

// The latest version of a holon as of a view, and where it lies.
export async function holonAt(storage: Storage, view: View | null, id: string) {
  const pointer = (await found(storage, view, "ids", keyOf([id]))) as Pointer | undefined;
  if (!pointer) return null;
  return { pointer, version: JSON.parse(decoder.decode(await versionBytes(storage, pointer))) as Holon };
}

// The wholes that hold a holon, as of a view.
export async function wholesOf(storage: Storage, view: View | null, id: string): Promise<string[]> {
  const holding = await foundBetween(storage, view, "refers", ...prefixOf([id, "$holds"]));
  return holding.map(([key]) => partsOf(key)[2] as string);
}

function versionBytes(storage: Storage, [part, offset, length]: Pointer) {
  return storage.read(part, offset, length);
}

async function holonLines(storage: Storage, view: View, ids: string[]) {
  const pointers = await Promise.all(ids.map((id) => found(storage, view, "ids", keyOf([id]))));
  return Promise.all(pointers.filter(Boolean).map((pointer) => versionBytes(storage, pointer as Pointer)));
}

// The facts a clause asks for, from the tree that begins with what it knows: a holon's
// own version, when its holon is known; else by attribute and value, by reference, or by
// attribute alone.
async function factsFor(storage: Storage, view: View, { e, a, v }: Clause) {
  const matches = (fact: { a: string; v: unknown }) =>
    (a === undefined || fact.a === a) && (v === undefined || JSON.stringify(fact.v) === JSON.stringify(v));

  if (e !== undefined) {
    const held = await holonAt(storage, view, e);
    return held ? factsOf(held.version).filter(matches) : [];
  }

  // The facts the keys found say, each [holon, attribute, value] as its key holds it.
  const facts = async (found: [e: unknown, a: unknown, v: unknown][]) =>
    (await Promise.all(found.map(([e, a, v]) => factsKept(storage, view, e as string, a, v))))
      .flat()
      .filter(matches);

  if (a !== undefined && v !== undefined) {
    const entries = await foundBetween(storage, view, "value", ...prefixOf([a, v]));
    return facts(entries.map(([key]) => [partsOf(key)[2], a, partsOf(key)[1]]));
  }

  if (v !== undefined && isRef(v)) {
    const entries = await foundBetween(storage, view, "refers", ...prefixOf([v.$ref]));
    return facts(entries.map(([key]) => [partsOf(key)[2], partsOf(key)[1], v]));
  }

  if (a !== undefined) {
    const entries = await foundBetween(storage, view, "value", ...prefixOf([a]));
    return facts(entries.map(([key]) => [partsOf(key)[2], a, partsOf(key)[1]]));
  }

  throw new Error("a clause needs a holon, an attribute or a reference");
}

// The fact a key holds, or, where the key kept only the beginning of a long string, the
// holon's facts that string stands for, read whole from the holon.
async function factsKept(storage: Storage, view: View, e: string, a: unknown, v: unknown): Promise<Fact[]> {
  if (!isLong(a) && !isLong(v)) return [{ e, a: a as string, v: v as Value }];

  const held = await holonAt(storage, view, e);
  const kept = (part: unknown, value: unknown) =>
    isLong(part) ? standsFor(part, value) : JSON.stringify(part) === JSON.stringify(value);
  return held ? factsOf(held.version).filter((fact) => kept(a, fact.a) && kept(v, fact.v)) : [];
}

// A holon's versions, newest first, each line as it was written: every act that set it,
// as the index keeps them by id. A holon let go has none.
async function versionLines(storage: Storage, view: View, id: string) {
  const all = await stamps(storage, view, "ids", keyOf([id]));
  if (!all.length || all[0]!.value === null) return [];

  const pointers = all.flatMap(({ value }) => (value ? [valueFrom("ids", value) as Pointer] : []));
  return Promise.all(pointers.map((pointer) => versionBytes(storage, pointer)));
}

// The acts from a head back to the one named since, newest first: each commit's act,
// with its content hash.
async function actLines(storage: Storage, commit: string, since: string | undefined) {
  const acts: Uint8Array[] = [];
  let name: string | undefined = commit;

  while (name) {
    const { act, predecessors } = await commitAt(storage, name);
    const { act: hash } = await headAt(storage, name);
    if (hash === since) break;
    acts.push(json({ hash, ...act }));
    name = predecessors[0];
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
