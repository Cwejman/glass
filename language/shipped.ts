// The language as glass ships it, and the reads written over it: its types and the
// functions everything drawing or asking the field applies, each found once by its route
// when glass is mounted, and known after by its id, never by its name; and any other
// table of routes, as the components their own, found the same way.
//
// Finding them is the one read that carries what it applies: a use, a function, and the
// native parse, under handles of their own, so none is taken for a holon of the field.

import type { Engine, Read } from "../engine/engine.ts";
import { isRef, type Value } from "../engine/read/values.ts";
import type { Holon } from "../stores/store.ts";

// The language as glass ships it, by route from glass's level: what a use and a function
// are, the store's types, and the functions read by everything drawing or asking the field.
export const language = {
  use: "language/use",
  function: "language/function",
  store: "store/store",
  shape: "store/shape",
  holon: "functions/holon",
  whole: "functions/whole",
  sections: "functions/sections",
  get: "functions/get",
  in: "functions/in",
  parse: "functions/parse",
  print: "functions/print",
  steps: "functions/steps",
  chain: "functions/chain",
  back: "functions/back",
  quote: "functions/quote",
};

// What routes name, each by its id.
export type Found<Routes> = Record<keyof Routes, string>;

// The language glass ships, each by its id.
export type Glass = Found<typeof language>;

// The functions applied by name: natives, and sections, written in the language.
export type Applied =
  | "holon"
  | "whole"
  | "sections"
  | "get"
  | "in"
  | "parse"
  | "print"
  | "steps"
  | "chain"
  | "back";

// What glass ships at routes, found in the store glass is mounted as: the language by
// default, or any table of routes, as the components their own.
export async function found<Routes extends Record<string, string> = typeof language>(
  read: Engine["read"],
  routes: Routes = language as unknown as Routes,
  store = "glass",
): Promise<Found<Routes>> {
  const declared = { says: "", shape: "json", optional: true };
  const text = `{${Object.entries(routes)
    .map(([key, route]) => `${key}: @${store}:${route}`)
    .join(", ")}}`;

  const asked = await read({
    gives: held("~1"),
    holons: [
      { id: "~use", instance: [], name: "use", mould: { fn: declared, args: declared }, body: {} },
      { id: "~function", instance: [], name: "function", mould: { input: declared }, body: {} },
      { id: "~parse", instance: ["~function"], body: { native: "parse" } },
      { id: "~1", instance: ["~use"], body: { fn: { $ref: "~parse" }, args: [text] } },
    ],
  });
  if (!("value" in asked)) throw new Error(`what glass ships was not read: ${asked.problem}`);

  const answer = await read(asked.value as unknown as Read);
  if (!("value" in answer)) throw new Error(`what glass ships was not found: ${answer.problem}`);

  const ids = answer.value as Record<string, Value>;
  return Object.fromEntries(
    Object.entries(routes).map(([key, route]) => {
      const id = ids[key];
      if (!isRef(id)) throw new Error(`glass ships nothing at ${route}`);
      return [key, id.$ref];
    }),
  ) as Found<Routes>;
}

const held = (id: string) => ({ $ref: id, $holds: true });

// Applying a function in a read of its own: what it is given is quoted, as it is, so the
// references within a value, a read's handles among them, stay its own. Its handles are
// named, so none is taken for a handle of a read it is given.
function uses(glass: Glass, id: string, fn: string, args: Value[]): Holon[] {
  const use = (id: string, fn: string, args: unknown[]): Holon => ({
    id,
    instance: [glass.use],
    body: { fn: { $ref: fn }, args },
  });
  const quoted = args.map((arg, i) => use(`${id}-${i}`, glass.quote, [arg]));
  return [
    use(
      id,
      fn,
      quoted.map(({ id }) => held(id)),
    ),
    ...quoted,
  ];
}

// A function applied to values.
export function applying(glass: Glass, applied: Applied, ...args: Value[]): Read {
  return { gives: held("~asked"), holons: uses(glass, "~asked", glass[applied], args) };
}

// A function applied to each list of values in turn, giving a list.
export function applyingEach(glass: Glass, applied: Applied, each: Value[][]): Read {
  return {
    gives: each.map((_, i) => held(`~asked-${i}`)),
    holons: each.flatMap((args, i) => uses(glass, `~asked-${i}`, glass[applied], args)),
  };
}

// The way back from a place within a read: what the drawing at at, given value at place,
// would be changed by (back.ts), worked out over the holons the read carries.
export function proposing(
  glass: Glass,
  within: Read,
  at: readonly string[],
  place: number,
  value: Value,
): Read {
  return {
    gives: held("~proposed"),
    holons: [...(within.holons ?? []), ...uses(glass, "~proposed", glass.back, [[...at], place, value])],
  };
}
