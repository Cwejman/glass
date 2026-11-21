// The reads the interface writes itself, over what glass ships: the types, the natives
// it reads by and the components it realizes, each found once by its route when the page
// opens, and known after by its id, never by its name.
//
// Finding them is the one read that carries what it applies: a use, a function, and the
// native parse, under handles of their own, so none is taken for a holon of the field.

import type { Engine, Read } from "../../engine/engine.ts";
import { isRef, type Value } from "../../engine/read/values.ts";
import type { Holon } from "../../stores/store.ts";

// What the interface asks of glass, by route from glass's level.
const routes = {
  use: "language/use",
  function: "language/function",
  store: "store/store",
  shape: "store/shape",
  row: "interface/row",
  holon: "functions/holon",
  whole: "functions/whole",
  get: "functions/get",
  in: "functions/in",
  parse: "functions/parse",
  print: "functions/print",
  steps: "functions/steps",
  chain: "functions/chain",
  back: "functions/back",
  quote: "functions/quote",
  Value: "components/Value",
  List: "components/List",
  Answer: "components/Answer",
  ExpressionInput: "components/ExpressionInput",
  Pill: "components/Pill",
  Choose: "components/Choose",
  Brief: "components/Brief",
  Search: "components/Search",
  Reader: "components/Reader",
};

// What glass ships that the interface asks for, each by its id.
export type Glass = Record<keyof typeof routes, string>;

// The natives the interface applies.
export type Native = "holon" | "whole" | "get" | "in" | "parse" | "print" | "steps" | "chain" | "back";

// What glass ships, found by its routes in the store glass is mounted as.
export async function found(read: Engine["read"], store = "glass"): Promise<Glass> {
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
  ) as Glass;
}

const held = (id: string) => ({ $ref: id, $holds: true });

// Applying a native in a read of its own: what it is given is quoted, as it is, so the
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

// A native applied to values.
export function applying(glass: Glass, native: Native, ...args: Value[]): Read {
  return { gives: held("~asked"), holons: uses(glass, "~asked", glass[native], args) };
}

// A native applied to each list of values in turn, giving a list.
export function applyingEach(glass: Glass, native: Native, each: Value[][]): Read {
  return {
    gives: each.map((_, i) => held(`~asked-${i}`)),
    holons: each.flatMap((args, i) => uses(glass, `~asked-${i}`, glass[native], args)),
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
