// The components realized on a surface, as the field says: each component whose holon
// names its code there, under realized, is drawn by that code's default export. Whoever
// starts the chassis says how code is loaded, the page from what was built, a test from
// the source, and which components the chassis draws for its own cases, by route.
//
// The code is named by its path from the repository's root, for now, until code is read
// through git.

import type { Engine } from "../../engine/engine.ts";
import { isRef, type Value } from "../../engine/read/values.ts";
import { applying, found, type Glass } from "../../language/shipped.ts";
import type { Drawer, Realization } from "./chassis.ts";

// A component's code, by its path, loaded.
export type Load = (path: string) => Promise<Realization>;

// The components the chassis draws for its own cases: the one that chooses where several
// could draw a value, the one drawing what no component takes by a type of the field, and
// the one saying a problem in place of a drawing that failed.
export type Own = { choose: string; fallback: string; problem: string };

export async function realizedOn(
  read: Engine["read"],
  glass: Glass,
  surface: string,
  load: Load,
  own: Own,
): Promise<Pick<Drawer, "realized" | "names" | keyof Own>> {
  const asked = await read(
    applying(
      glass,
      "parse",
      `find(?c, [?c, "instance", @glass:interface/component])
        | map(c => {component: c, name: c.name, code: c.realized.${surface}})`,
    ),
  );
  if (!("value" in asked)) throw new Error(asked.problem);
  const answer = await read(asked.value as never);
  if (!("value" in answer)) throw new Error(answer.problem);

  // Every component, by its id: what it is called, and its code here, where it has some.
  const each = (answer.value as { component: Value; name: string; code: string | null }[]).flatMap(
    ({ component, name, code }) => (isRef(component) ? [{ id: component.$ref, name, code }] : []),
  );
  const coded = each.filter(({ code }) => code);
  const loaded = await Promise.all(coded.map(({ code }) => load(code!)));

  return {
    realized: new Map(coded.map(({ id }, i) => [id, loaded[i]!])),
    names: new Map(each.map(({ id, name }) => [id, name])),
    ...(await found(read, own)),
  };
}
