// What strata refuses of an act on its own account, every problem at once: a holon
// without a well-formed id or types; an act whose hash is not the hash of what it says;
// and a part for this store that is not the part of the holons offered. Letting go of a
// holon it does not keep is no problem: an act's gone takes a holon out of every store
// that keeps it, and each store applies what it keeps. The rules over meaning, and which
// types a store admits, are judged by the engine.

import { contentOf, hashOf, partOf } from "../act.ts";
import type { Act, Problem } from "../store.ts";

const id = /^[0-9A-HJKMNP-TV-Z]{15}$/;

export async function refusals(act: Act): Promise<Problem[]> {
  const problems: Problem[] = [];

  for (const holon of act.holons) {
    if (!id.test(holon.id))
      problems.push({ rule: "id", id: holon.id, says: "its id is not 15 characters of an id" });
    if (!Array.isArray(holon.instance))
      problems.push({ rule: "instance", id: holon.id, says: "it does not say what it is an instance of" });
  }

  if ((await hashOf(contentOf(act))) !== act.hash)
    problems.push({ rule: "hash", says: "the act's hash is not the hash of what it says" });

  const part = partOf(act.holons);
  const named = act.parts.filter(([store]) => store === act.own);
  if (named.length !== 1 || named[0]![1] !== (part && (await hashOf(part))))
    problems.push({ rule: "part", says: "the act does not name this store's part as the holons offered make it" });

  return problems;
}
