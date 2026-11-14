// Counts up in a storage's head from a process of its own: each step reads the head,
// writes a blob one more than it, and moves the head, trying again when another writer
// moved it first. Run as: bun storage/fixtures/count.ts <folder> <steps>

import { folderStorage } from "../folder.ts";
import type { Storage } from "../storage.ts";

export async function count(storage: Storage, steps: number) {
  for (let step = 0; step < steps; step++) await countOnce(storage);
}

async function countOnce(storage: Storage): Promise<void> {
  const head = await storage.head();
  const now = head ? Number(new TextDecoder().decode(await storage.read(head))) : 0;
  const next = await storage.put(new TextEncoder().encode(String(now + 1)));

  if (!(await storage.moveHead(head, next))) return countOnce(storage);
}

if (import.meta.main) await count(folderStorage(process.argv[2]!), Number(process.argv[3]));
