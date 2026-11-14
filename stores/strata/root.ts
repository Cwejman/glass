// A root: one small blob of JSON tying a moment of the store together. It names the act
// it records, what that act touches, the root before it, the root node of each tree, and
// the layers whose entries are not yet merged into the trees, oldest first. A head names
// a root; following previous from it walks the store's history back to its first act.
//
// A root laid by compaction records no act of its own: it carries the act before it,
// touches nothing, and is marked pressed.

import type { Head, Touches } from "../store.ts";
import type { Tree } from "./entries.ts";
import { remembered } from "./remembered.ts";
import type { Storage } from "./storage/storage.ts";
import type { Pointer } from "./tree.ts";

// A layer not yet merged: its blob, and where its entries line lies in it.
export type Pending = { layer: string; entries: [offset: number, length: number] };

export type Root = {
  act: string;
  at: string;
  says: string;
  touches: Touches;
  previous: string | null;
  trees: Partial<Record<Tree, Pointer | null>>;
  pending: Pending[];
  pressed?: true;
};

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function rootAt(storage: Storage, name: string): Promise<Root> {
  return remembered(`root ${name}`, 1024, async () => JSON.parse(decoder.decode(await storage.read(name))));
}

export async function headAt(storage: Storage, name: string): Promise<Head> {
  return { act: (await rootAt(storage, name)).act, page: name };
}

// The store's head as it is now, or null for a store never written.
export async function headNow(storage: Storage): Promise<Head | null> {
  const name = await storage.head();
  return name === null ? null : headAt(storage, name);
}

export const rootBytes = (root: Root) => encoder.encode(JSON.stringify(root));
