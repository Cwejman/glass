// The names a text is read and said by, asked of the field ahead, so reading and saying,
// which ask nothing as they go, find them at once: the holons each word and each name of
// a route finds, with their types; what holds those a route passes; and the holons a
// read refers to, with those named as they are. A function is a holon of a type whose
// mould declares input. The language's types, use, function and value, are found by
// name, glass's own where several share one, as language/names.ts finds them.

import { reached, type Known as Walked } from "../../../language/names.ts";
import type { Names, Route } from "../../../language/text.ts";
import type { Holon } from "../../../stores/store.ts";
import { isRoot } from "../../moulds.ts";
import type { Field } from "./field.ts";
import { knownAs, type Known } from "./input.ts";

// What is asked: the words a text uses, its routes, and the holons a read refers to.
export type Asking = { words?: Iterable<string>; routes?: readonly Route[]; ids?: Iterable<string> };

// The names, and each holon asked, found by its id.
export type FoundNames = Names & { holon(id: string): Holon | undefined };

const languageTypes = ["use", "function", "value"];

export async function namesOver(
  field: Field,
  { words = [], routes = [], ids = [] }: Asking,
): Promise<FoundNames> {
  const asked = new Map<string, Promise<(Known & { store: string }) | null>>();
  const holonOf = (id: string) => {
    if (!asked.has(id))
      asked.set(
        id,
        (async () => {
          const kept = await field.holon(id);
          if (!kept) return null;

          const types = await Promise.all(kept.holon.instance.map((type) => field.holon(type)));
          const known = knownAs(
            kept.holon,
            types.flatMap((type) => (type ? [type.holon] : [])),
          );
          return { ...known, store: kept.store };
        })(),
      );
    return asked.get(id)!;
  };

  const referred = await Promise.all([...ids].map(holonOf));
  const names = new Set([
    ...words,
    ...routes.flatMap(({ names }) => names),
    ...languageTypes,
    "get",
    ...referred.flatMap((found) => (found?.holon.name === undefined ? [] : [found.holon.name])),
  ]);

  const byName = new Map(
    await Promise.all(
      [...names].map(async (name) => {
        const named = (await field.facts({ a: "name", v: name })).map(({ e }) => e);
        await Promise.all(named.map(holonOf));
        return [name, named] as const;
      }),
    ),
  );

  // What holds each holon a route passes, and the types of those, to know a root.
  const passed = [...new Set(routes.flatMap(({ names }) => names.flatMap((name) => byName.get(name) ?? [])))];
  const holders = new Map(
    await Promise.all(
      passed.map(async (id) => {
        const wholes = (await field.facts({ a: "$holds", v: { $ref: id } })).map(({ e }) => e);
        await Promise.all(wholes.map(holonOf));
        return [id, wholes] as const;
      }),
    ),
  );

  const found = new Map(
    await Promise.all([...asked].map(async ([id, finding]) => [id, await finding] as const)),
  );
  const known = (id: string) => found.get(id) ?? undefined;
  const isFunction = (id: string) => known(id)?.applicable ?? false;

  const walked: Walked = {
    named: (name) => byName.get(name) ?? [],
    storeOf: (id) => known(id)?.store,
    holdersOf: (id) => holders.get(id) ?? [],
    isRoot: (id) => {
      const whole = known(id);
      return whole !== undefined && isRoot(whole.holon, (type) => whole.types.find(({ id }) => id === type));
    },
  };

  return {
    functions: (name) => walked.named(name).filter(isFunction),
    holons: (route) => reached(route, walked),
    isFunction,
    nameOf: (id) => known(id)?.holon.name,
    about(id) {
      const holon = known(id);
      const types = holon?.types.map((type) => type.name ?? type.id).join(", ") || "?";
      return `(${types}) in ${holon?.store ?? "?"}`;
    },
    typeOf(name) {
      const types = walked.named(name).filter((id) => known(id)?.holon.mould);
      return types.length > 1 ? types.find((id) => known(id)?.store === "glass") : types[0];
    },
    holon: (id) => known(id)?.holon,
  };
}
