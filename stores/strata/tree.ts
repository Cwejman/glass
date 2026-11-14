// A tree of sorted keys, kept in nodes of at most 64 entries (about 4 KB) that are never
// changed. Nodes are written as JSON lines into a segment, one blob per merge, and read
// one at a time by offset. A merge writes only the nodes on the paths it changes; every
// other node is shared with the trees before, so an older root still reads the tree as it
// was.
//
// A pointer names a node: its segment, offset and length. A pointer written in a segment
// to a node of that same segment leaves the segment empty, since the segment's name, the
// hash of its bytes, is not known until all of it is written.
//
// Keys are strings, made by keyOf from parts, so that one prefix of parts finds every key
// beginning with it. They sort for equality and prefixes, not for numeric ranges.

import { remembered } from "./remembered.ts";
import type { Storage } from "./storage/storage.ts";

export type Pointer = [segment: string, offset: number, length: number];
export type Entry = [key: string, value: unknown];

// An entry to merge: a value to set, or null to remove the key.
export type Change = [key: string, value: unknown | null];

type Node = { leaf: Entry[] } | { branch: [first: string, child: Pointer][] };

const most = 64;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// A key made of parts. Each part is JSON, which never holds a raw \u0000, so the
// separator sorts below anything a part can hold.
export function keyOf(parts: unknown[]): string {
  return parts.map((part) => JSON.stringify(part)).join("\u0000");
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

export async function get(storage: Storage, root: Pointer | null, key: string): Promise<unknown | undefined> {
  if (!root) return undefined;
  const node = await nodeAt(storage, root);

  if ("leaf" in node) return node.leaf.find(([each]) => each === key)?.[1];

  const at = childFor(node.branch, key);
  return get(storage, resolved(node.branch[at]![1], root[0]), key);
}

// Every entry with a key from `from`, up to but not including `to`, in order.
export async function between(
  storage: Storage,
  root: Pointer | null,
  from: string,
  to: string,
): Promise<Entry[]> {
  if (!root) return [];
  const node = await nodeAt(storage, root);

  if ("leaf" in node) return node.leaf.filter(([key]) => key >= from && key < to);

  const reached = node.branch.filter(
    ([first], i) => first < to && (i + 1 === node.branch.length || node.branch[i + 1]![0] > from),
  );
  const found = await Promise.all(
    reached.map(([, child]) => between(storage, resolved(child, root[0]), from, to)),
  );
  return found.flat();
}

// The nodes that merging the changes into a tree makes, as bytes for a new segment, and
// the new tree's root, or null for a tree left empty. The root's segment is empty: it is
// in the new segment, named once that is written. Changes must be sorted by key. Where
// several trees share one segment, start says where in it these bytes will begin.
export async function merged(storage: Storage, root: Pointer | null, changes: Change[], start = 0) {
  const segment = segmentWriter(start);
  let top = await mergeInto(storage, root, changes, segment);

  while (top.length > 1) top = writeBranches(top, segment);

  return { bytes: segment.bytes(), root: top[0]?.[1] ?? null };
}

// A pointer from the root page, which names its segment in full.
export function within(pointer: Pointer | null, segment: string): Pointer | null {
  return pointer && resolved(pointer, segment);
}

// ---- Merging

type Written = [first: string, pointer: Pointer];

async function mergeInto(
  storage: Storage,
  root: Pointer | null,
  changes: Change[],
  segment: ReturnType<typeof segmentWriter>,
): Promise<Written[]> {
  if (!root) return writeLeaves(applied([], changes), segment);

  const node = await nodeAt(storage, root);
  if ("leaf" in node) return writeLeaves(applied(node.leaf, changes), segment);

  const children: Written[] = [];
  const groups = grouped(node.branch, changes);

  for (const [i, [first, child]] of node.branch.entries()) {
    const pointer = resolved(child, root[0]);
    if (!groups[i]!.length) children.push([first, pointer]);
    else children.push(...(await mergeInto(storage, pointer, groups[i]!, segment)));
  }

  return children.length ? writeBranches(children, segment) : [];
}

// A leaf's entries with the changes applied: set, replaced or removed, in key order.
function applied(entries: Entry[], changes: Change[]): Entry[] {
  const all = new Map(entries);
  for (const [key, value] of changes) value === null ? all.delete(key) : all.set(key, value);
  return [...all].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

// The changes each child of a branch receives: each goes to the last child whose first
// key is at or below it, or to the first child.
function grouped(branch: [string, Pointer][], changes: Change[]): Change[][] {
  const groups: Change[][] = branch.map(() => []);
  for (const change of changes) groups[childFor(branch, change[0])]!.push(change);
  return groups;
}

function writeLeaves(entries: Entry[], segment: ReturnType<typeof segmentWriter>): Written[] {
  return chunks(entries).map((leaf) => [leaf[0]![0], segment.write({ leaf })]);
}

function writeBranches(children: Written[], segment: ReturnType<typeof segmentWriter>): Written[] {
  return chunks(children).map((branch) => [branch[0]![0], segment.write({ branch })]);
}

function chunks<T>(items: T[]): T[][] {
  const all: T[][] = [];
  for (let at = 0; at < items.length; at += most) all.push(items.slice(at, at + most));
  return all;
}

// The nodes of one merge, as JSON lines. Each pointer it gives leaves the segment empty.
function segmentWriter(start: number) {
  const lines: Uint8Array[] = [];
  let offset = start;

  function write(node: Node): Pointer {
    const line = encoder.encode(JSON.stringify(node) + "\n");
    lines.push(line);
    offset += line.length;
    return ["", offset - line.length, line.length - 1];
  }

  function bytes() {
    const all = new Uint8Array(offset - start);
    let at = 0;
    for (const line of lines) {
      all.set(line, at);
      at += line.length;
    }
    return all;
  }

  return { write, bytes };
}

// ---- Reading

function childFor(branch: [string, Pointer][], key: string) {
  let at = 0;
  while (at + 1 < branch.length && branch[at + 1]![0] <= key) at++;
  return at;
}

function resolved(pointer: Pointer, segment: string): Pointer {
  return pointer[0] === "" ? [segment, pointer[1], pointer[2]] : pointer;
}

// A node read once is kept: the nodes near a tree's root are read on every lookup.
function nodeAt(storage: Storage, [segment, offset, length]: Pointer): Promise<Node> {
  return remembered(`node ${segment} ${offset}`, length, async () =>
    JSON.parse(decoder.decode(await storage.read(segment, offset, length))),
  );
}
