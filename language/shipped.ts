// The language as glass ships it, and the reads written over it: its types and the
// functions everything drawing or asking the field applies, each found once by its route
// when glass is mounted, and known after by its id; and any other table of routes, as
// the components their own, found the same way. An expression written in code, q`…`, is
// read as any text is, its functions found by their names.
//
// Finding them is the one read that carries what it applies: a use, a function, and the
// native parse, under handles of their own, so none is taken for a holon of the field.

import type { Engine, Read } from "../engine/engine.ts";
import { isRecord, isRef, type Value } from "../engine/read/values.ts";
import type { Holon } from "../stores/store.ts";

// The language as glass ships it, by route from glass's level: what a use and a function
// are, the store's types a store is begun with, and the functions applied by name by
// everything drawing or asking the field.
export const language = {
  use: "language/use",
  function: "language/function",
  store: "store/store",
  shape: "store/shape",
  holon: "functions/holon",
  whole: "functions/whole",
  sections: "functions/sections",
  taking: "functions/taking",
  wholes: "functions/wholes",
  roots: "functions/roots",
  get: "functions/get",
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

// The functions applied by name: natives, and those written in the language, as sections.
export type Applied = Exclude<keyof Glass, "use" | "function" | "store" | "shape">;

// What glass ships at routes, found in the store glass is mounted as: the language by
// default, or any table of routes, as the components their own; a route naming its store,
// components:Pill, is found there.
export async function found<Routes extends Record<string, string> = typeof language>(
  read: Engine["read"],
  routes: Routes = language as unknown as Routes,
  store = "glass",
): Promise<Found<Routes>> {
  const declared = { says: "", shape: "json", optional: true };
  const text = `{${Object.entries(routes)
    .map(([key, route]) => `${key}: @${route.includes(":") ? route : `${store}:${route}`}`)
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

// The language written in code, as a template: q`print(${step})`. What is put into it
// is a value, held as it is and never read as words of the language, so a string stays
// a string, a holon given as { $ref } is that holon, and a read is a read. A value is
// put where a value is written, never within quotes nor against a word or another value.
export type Expression = { written: TemplateStringsArray; values: Value[] };

export const q = (written: TemplateStringsArray, ...values: Value[]): Expression => ({ written, values });

export const isExpression = (value: unknown): value is Expression =>
  isRecord(value) && Array.isArray(value.written) && Array.isArray(value.values);

// What a template says as text: where it holds values, a lambda taking one word for
// each, _0 and on, so the language reads it as it is and the values are given apart.
export function textOf({ written }: Expression): string {
  const body = written.reduce((text, part, i) => `${text}_${i - 1}${part}`);
  if (written.length === 1) return body;
  return `(${written
    .slice(1)
    .map((_, i) => `_${i}`)
    .join(", ")}) => ${body}`;
}

// A template read as the language read its text, given its values: the lambda it reads
// as applied to each value, quoted.
export function filled(glass: Glass, read: Read, values: readonly Value[]): Read {
  if (!values.length) return read;
  const lambda = read.gives as { $ref: string };
  return {
    gives: held("~filled"),
    holons: [...(read.holons ?? []), ...uses(glass, "~filled", lambda.$ref, [...values])],
  };
}

// Reads asked as one, giving a list, each in its place: each read's handles named apart,
// what a quote holds left as it is, since a value's references are its own.
export function together(glass: Glass, reads: readonly Read[]): Read {
  const each = reads.map((read, i) => apart(glass, read, `~${i}`));
  return { gives: each.map(({ gives }) => gives), holons: each.flatMap(({ holons }) => holons ?? []) };
}

function apart(glass: Glass, { gives, holons = [] }: Read, prefix: string): Read {
  const named = (id: string) => (id.startsWith("~") ? `${prefix}${id}` : id);
  const within = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(within);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        key === "$ref" && typeof inner === "string" ? named(inner) : within(inner),
      ]),
    );
  };
  return {
    gives: within(gives),
    holons: holons.map((holon) => {
      const quoting =
        isRef(holon.body.fn ?? null) && (holon.body.fn as { $ref: string }).$ref === glass.quote;
      return {
        ...holon,
        id: named(holon.id),
        instance: holon.instance.map(named),
        body: quoting ? holon.body : (within(holon.body) as Holon["body"]),
      };
    }),
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

// A holon as the function holon gives it, its store and its types' names set aside.
export function asHolon({ id, instance, name, mould, body }: Record<string, unknown>): Holon {
  return {
    id: String(id),
    instance: Array.isArray(instance) ? instance.map(String) : [],
    ...(typeof name === "string" && { name }),
    ...(isRecord(mould) && { mould: mould as Holon["mould"] }),
    body: (isRecord(body) ? body : {}) as Holon["body"],
  };
}
