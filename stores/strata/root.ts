// A root: one small blob of JSON tying a moment of the store together. It names the act
// it records, its number, counting from 1, what that act touches, the root before it, and
// the runs that make up the index, newest first. A head names a root; following previous
// from it walks the store's history back to its first act.
//
// Every run's entries are stamped with their act, so the runs of the latest root answer
// for every head before it too: as of a head, an entry counts if its act's number is the
// head's or lower. An older root's runs may since have been merged and removed.
//
// A root laid by compaction records no act of its own: it carries the act before it and
// its number, touches nothing, and is marked pressed.

import type { Head, Touches } from "../store.ts";
import { remembered } from "./remembered.ts";
import type { Run } from "./run.ts";
import type { Storage } from "./storage/storage.ts";

export type Root = {
  act: string;
  number: number;
  at: string;
  says: string;
  touches: Touches;
  previous: string | null;
  runs: Run[];
  pressed?: true;
};

// The index as of a head: the latest root's runs, and the number of the head's act.
export type View = { runs: Run[]; upTo: number };

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

// The index as of a head, read through the runs the store has now.
export async function viewAt(storage: Storage, head: Head | null): Promise<View | null> {
  if (!head) return null;
  const now = await storage.head();
  const latest = await rootAt(storage, now ?? head.page);
  return { runs: latest.runs, upTo: (await rootAt(storage, head.page)).number };
}

export const rootBytes = (root: Root) => encoder.encode(JSON.stringify(root));
