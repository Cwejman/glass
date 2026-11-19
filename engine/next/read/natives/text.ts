// Text, the language as it is typed: parse reads a text into a read, the uses it gives
// carried under handles, { gives, holons }, as a value, for a read to give or a change to
// commit; print says such a read as text again. Each is the other's reverse, a pair, so
// print(parse(t)) is t. Both are native because the language's reader is code
// (language/text.ts); the names a text uses are asked of the field before it is read.
//
// A holon is said by the route of names that reaches it alone, where one does, so what is
// printed reads as the field names it, and else by its id.
//
// A blank text reads as nothing, null, the read of no steps, and nothing is said as a
// blank text. A text that does not read is refused, saying where, as a malformed pattern
// is; what is not a text, or not a read, gives null.

import { isHandle } from "../../../handles.ts";
import { namesUsed, printRead, syntax, toRead, type Route } from "../../../../language/text.ts";
import type { Holon } from "../../../../stores/store.ts";
import type { Read } from "../../engine.ts";
import type { Field } from "../field.ts";
import { namesOver } from "../names.ts";
import { isRecord, isRef, type Value } from "../values.ts";
import type { Calling, Native } from "./natives.ts";

export function text({ field }: Calling): Record<string, Native> {
  return {
    async parse([written]) {
      if (typeof written !== "string" || !written.trim()) return null;

      const names = await namesOver(field, namesUsed(written));
      return toRead(syntax(written), names) as unknown as Value;
    },

    async print([read]) {
      if (read === null) return "";
      if (!isRecord(read) || !("gives" in read)) return null;

      const carried = (Array.isArray(read.holons) ? read.holons : []) as unknown as Holon[];
      const ids = await referredBy(field, [read.gives, ...carried.map(({ body }) => body)]);
      const names = await namesOver(field, { ids });
      const routes = await routesTo(
        field,
        ids.filter((id) => !names.isFunction(id)),
      );
      return printRead(
        { gives: read.gives, holons: carried } as Read,
        { ...names, routeOf: (id) => routes.get(id) },
        names.holon,
      );
    },
  };
}

// The route that reaches each holon alone, where one does: its name, from anywhere or
// from its store's level; else a whole holding it named before it, the same two ways.
async function routesTo(field: Field, ids: string[]): Promise<Map<string, Route>> {
  const tried = await Promise.all(
    ids.map(async (id): Promise<[string, Route[]]> => {
      const kept = await field.holon(id);
      const name = kept?.holon.name;
      if (!kept || name === undefined) return [id, []];

      const holders = await field.facts({ a: "$holds", v: { $ref: id } });
      const wholes = await Promise.all(holders.map(({ e }) => field.holon(e)));
      const within = wholes.flatMap((whole) =>
        whole?.holon.name === undefined ? [] : [[whole.holon.name, name]],
      );
      const { store } = kept;
      return [id, [[name], ...within].flatMap((names) => [{ names }, { store, names }])];
    }),
  );

  const names = await namesOver(field, { routes: tried.flatMap(([, routes]) => routes) });
  const reaches = (route: Route, id: string) => {
    const found = names.holons(route);
    return found.length === 1 && found[0] === id;
  };
  return new Map(
    tried.flatMap(([id, routes]) => {
      const route = routes.find((route) => reaches(route, id));
      return route ? [[id, route] as const] : [];
    }),
  );
}

// The holons of the field a read refers to, and those referred to within each it holds,
// as saying it goes into them; the handles it carries are its own.
async function referredBy(field: Field, values: unknown[]): Promise<string[]> {
  const found = new Set<string>();

  async function walk(value: unknown): Promise<void> {
    if (value === null || typeof value !== "object") return;
    if (Array.isArray(value)) return void (await Promise.all(value.map(walk)));
    if (!isRef(value)) return void (await Promise.all(Object.values(value).map(walk)));

    const { $ref: id, $holds } = value as { $ref: string; $holds?: boolean };
    if (isHandle(id) || found.has(id)) return;

    found.add(id);
    if ($holds) await walk((await field.holon(id))?.holon.body);
  }

  await Promise.all(values.map(walk));
  return [...found];
}
