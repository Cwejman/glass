// The field as the author's tools see it, and the one way they write it: the holons of
// the wiki, the author's and glass, read as they stand, and each change committed through
// the engine here (stores.ts), into the wiki and the author's, the two stores they write.
// The engine judges it as it judges any commit; nothing writes to a store past it.
//
// A type is found by its name: the author's and the wiki's own, then glass's prose, then
// the rest of glass's, so prose's list is the list a brief holds, never the kind of value.

import { engineHere, holonsHere, typesOf } from "../stores.ts";
import type { Holon as Kept } from "../stores/store.ts";
import type { Change } from "../engine/next/commit/change.ts";

export const writes = ["wiki", "author"] as const;

export async function authorsField() {
  const { glass, wiki, author } = await holonsHere("glass", ...writes);
  const prose = glass!.find(
    ({ name, mould, body }) => name === "prose" && !mould && Array.isArray(body.holds),
  );
  const inProse = new Set(((prose?.body.holds ?? []) as { $ref: string }[]).map(({ $ref }) => $ref));
  const holons: Holon[] = [...wiki!, ...author!, ...glass!];
  const types = typesOf([...author!, ...wiki!, ...glass!.filter(({ id }) => inProse.has(id)), ...glass!]);
  return { holons, types };
}

// A change committed, or a refusal thrown that says every problem. What landed is said
// by store, with the ids its handles were given.
export async function commitOf(change: Omit<Change, "at">) {
  const engine = await engineHere({ writes });
  const done = await engine.commit({ ...change, at: {} });
  if ("refused" in done)
    throw new Error(
      `${change.says} was refused:\n${done.refused.map(({ id, rule, says }) => `  ${id ?? ""} ${rule}: ${says}`).join("\n")}`,
    );
  if (done.missed) throw new Error(`${change.says} did not land everywhere: ${JSON.stringify(done.missed)}`);

  const landed = Object.fromEntries(
    Object.entries(done.landed).map(([store, { commit }]) => [store, commit]),
  );
  return { ids: done.ids, landed };
}

// A holon as the tools write it: its body read and changed in place, key by key.
export type Holon = Omit<Kept, "body"> & { body: Record<string, any> };
