// The names a text is read and said by, as the field holds them: a function by the
// name it carries among the functions, a holon by its name or a route of names down
// the wholes that hold it, from anywhere or from a store's level.
//
// They are found in a field one holds, or asked of an engine through its reads alone,
// so whoever reads the field by text needs nothing but what the engine answers. Either
// way a route is walked the same way, over what is known of the holons it passes.

import type { Engine, HolonRead } from "../engine/engine.ts";
import type { Everything } from "../engine/expression.ts";
import { namesUsed, type Names, type Route } from "./text.ts";

// What walking a route needs to know of the field.
type Known = {
  named(name: string): string[];
  storeOf(id: string): string | undefined;
  holdersOf(id: string): string[];
  isRoot(id: string): boolean;
};

// The holons a route reaches: the first name among all, or among a store's level, what
// nothing in it holds but its root; each next name among what the one before holds.
function reached({ store, names }: Route, known: Known) {
  const atLevel = (id: string) =>
    known.storeOf(id) === store &&
    !known.holdersOf(id).some((whole) => known.storeOf(whole) === store && !known.isRoot(whole));

  let found = known.named(names[0]!).filter((id) => store === undefined || atLevel(id));

  for (const name of names.slice(1)) {
    const wholes = new Set(found);
    found = known.named(name).filter((id) => known.holdersOf(id).some((whole) => wholes.has(whole)));
  }

  return found;
}

const keyOf = (route: Route) => JSON.stringify([route.store ?? null, route.names]);

export function namesIn(all: Everything): Names {
  const byName = new Map<string, string[]>();

  for (const { holon } of all.known.values()) {
    if (holon.name === undefined) continue;

    const same = byName.get(holon.name);
    if (same) same.push(holon.id);
    else byName.set(holon.name, [holon.id]);
  }

  const functionTypes = new Set(byName.get("function")?.filter((id) => all.known.get(id)?.holon.mould) ?? []);
  const isFunction = (id: string) =>
    all.known.get(id)?.holon.instance.some((type) => functionTypes.has(type)) ?? false;

  const known: Known = {
    named: (name) => byName.get(name) ?? [],
    storeOf: (id) => all.known.get(id)?.store,
    holdersOf: (id) => (all.holders.get(id) ?? []).filter(({ holds }) => holds).map(({ from }) => from),
    isRoot: (id) =>
      all.known.get(id)?.holon.instance.some((type) => all.known.get(type)?.holon.name === "store") ?? false,
  };

  return {
    functions: (name) => known.named(name).filter(isFunction),
    holons: (route) => reached(route, known),
    isFunction,
    nameOf: (id) => all.known.get(id)?.holon.name,
  };
}

export async function namesAsked(read: Engine["read"], text: string): Promise<Names> {
  const { words: used, routes } = namesUsed(text);
  const words = [...new Set([...used, "get"])];

  const ids = new Map<string, string[]>();
  const holons = new Map<string, HolonRead | null>();
  const holders = new Map<string, string[]>();

  const named = async (name: string) => {
    if (!ids.has(name)) ids.set(name, await read({ named: name }));
    return ids.get(name)!;
  };

  const holonOf = async (id: string) => {
    if (!holons.has(id)) holons.set(id, await read({ holon: id }));
    return holons.get(id)!;
  };

  // What holds a holon, and the store each of those stands in.
  const holdersOf = async (id: string) => {
    if (!holders.has(id)) {
      const wholes = (await read({ holders: id })).filter(({ holds }) => holds).map(({ from }) => from);
      holders.set(id, wholes);
      await Promise.all(wholes.map(holonOf));
    }

    return holders.get(id)!;
  };

  const functionsNamed = new Map<string, string[]>();

  for (const word of words) {
    const found = await Promise.all((await named(word)).map(holonOf));
    functionsNamed.set(
      word,
      found.filter((holon) => holon?.types.includes("function")).map((holon) => holon!.id),
    );
  }

  // Everything a route passes is asked for first, so walking it asks for nothing.
  for (const { names } of routes) {
    for (const name of names) {
      for (const id of await named(name)) {
        await holonOf(id);
        await holdersOf(id);
      }
    }
  }

  const known: Known = {
    named: (name) => ids.get(name) ?? [],
    storeOf: (id) => holons.get(id)?.store,
    holdersOf: (id) => holders.get(id) ?? [],
    isRoot: (id) => holons.get(id)?.types.includes("store") ?? false,
  };

  const reachedBy = new Map(routes.map((route) => [keyOf(route), reached(route, known)]));

  return {
    functions: (name) => functionsNamed.get(name) ?? [],
    holons: (route) => reachedBy.get(keyOf(route)) ?? [],
    isFunction: (id) => [...functionsNamed.values()].some((each) => each.includes(id)),
    nameOf: (id) => holons.get(id)?.name,
    about(id) {
      const holon = holons.get(id);
      const held = (holders.get(id) ?? []).map((whole) => holons.get(whole)?.name ?? whole);
      const where = held.length
        ? `held by ${held.map((name) => JSON.stringify(name)).join(", ")}`
        : "held by nothing";

      return `(${holon?.types.join(", ") || "?"}) in ${holon?.store ?? "?"}, ${where}`;
    },
  };
}
