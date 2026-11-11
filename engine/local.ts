// An engine on this machine: every store this repository holds attached as itself, and
// those named written through it. Whatever reads or writes the field from here, an agent
// asking or the author's words being kept, goes through this engine, as the browser goes
// through its own; nothing writes to a store past it. Where nothing is to be written, a
// home held in memory takes what a reader keeps.

import { join } from "node:path";
import { memoryFiles } from "../integrations/glass/files.ts";
import { openStore } from "../integrations/glass/store.ts";
import { gitSource } from "../integrations/git/git.ts";
import { openStores, type StoreName } from "../stores.ts";
import { startEngine, type Engine } from "./engine.ts";

type Local = {
  // The stores written through this engine; every other is only read.
  writes?: readonly StoreName[];
  // This repository's own history, read through git, attached as the store git.
  git?: boolean;
};

export async function localEngine({ writes = [], git = false }: Local = {}): Promise<Engine> {
  const stores = Object.entries(await openStores());

  const engine = startEngine([
    ...(writes.length ? [] : [{ key: "home", store: await openStore(memoryFiles()), write: true as const }]),
    ...stores.map(([key, store]) =>
      writes.includes(key as StoreName)
        ? { key, store, write: true as const }
        : { key, store: store as typeof store, write: false as const },
    ),
  ]);

  if (git) await engine.attach("git", gitSource(join(import.meta.dir, "..")));

  return engine;
}
