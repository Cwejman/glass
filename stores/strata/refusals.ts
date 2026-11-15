// What strata refuses of an act on its own account, every problem at once: a holon
// without a well-formed id or types, and letting go of a holon it does not keep. The
// rules over meaning, and which types a store admits, are judged by the engine.

import type { Act, Head, Problem } from "../store.ts";
import { holonAt } from "./read.ts";
import { viewAt } from "./root.ts";
import type { Storage } from "./storage/storage.ts";

const id = /^[0-9A-HJKMNP-TV-Z]{15}$/;

export async function refusals(storage: Storage, at: Head | null, act: Act): Promise<Problem[]> {
  const problems: Problem[] = [];
  const view = await viewAt(storage, at);

  for (const holon of act.holons) {
    if (!id.test(holon.id))
      problems.push({ rule: "id", id: holon.id, says: "its id is not 15 characters of an id" });
    if (!Array.isArray(holon.instance))
      problems.push({ rule: "instance", id: holon.id, says: "it does not say what it is an instance of" });
  }

  for (const gone of act.gone)
    if (!(await holonAt(storage, view, gone)))
      problems.push({ rule: "gone", id: gone, says: "this store does not keep it" });

  return problems;
}
