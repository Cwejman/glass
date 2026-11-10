// The names a text is read and said by, as the field holds them: a function by the
// name it carries among the functions, a holon by its name or a route of names down
// the wholes that hold it, as an address is to be.

import type { Engine, HolonRead } from "../engine/engine.ts";
import type { Everything } from "../engine/expression.ts";
import { namesUsed, type Names } from "./text.ts";

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

  const heldBy = (id: string, wholes: Set<string>) =>
    (all.holders.get(id) ?? []).some(({ from, holds }) => holds && wholes.has(from));

  return {
    functions: (name) => (byName.get(name) ?? []).filter(isFunction),

    holons(route) {
      let found = byName.get(route[0]!) ?? [];

      for (const name of route.slice(1)) {
        const wholes = new Set(found);
        found = (byName.get(name) ?? []).filter((id) => heldBy(id, wholes));
      }

      return found;
    },

    isFunction,
    nameOf: (id) => all.known.get(id)?.holon.name,
  };
}

// The names a text uses, asked of an engine through its reads alone, so whoever reads
// the field by text needs nothing but what the engine answers.
export async function namesAsked(read: Engine["read"], text: string): Promise<Names> {
  const { words: used, routes } = namesUsed(text);
  const words = [...new Set([...used, "get"])];
  const ids = new Map<string, string[]>();
  const holons = new Map<string, HolonRead | null>();

  const named = async (name: string) => {
    if (!ids.has(name)) ids.set(name, await read({ named: name }));
    return ids.get(name)!;
  };

  const holonOf = async (id: string) => {
    if (!holons.has(id)) holons.set(id, await read({ holon: id }));
    return holons.get(id)!;
  };

  const functionsNamed = new Map<string, string[]>();

  for (const word of words) {
    const found = await Promise.all((await named(word)).map(holonOf));
    functionsNamed.set(
      word,
      found.filter((holon) => holon?.types.includes("function")).map((holon) => holon!.id),
    );
  }

  const reached = new Map<string, string[]>();
  const holdersOf = new Map<string, string[]>();

  for (const route of routes) {
    let found = await named(route[0]!);

    for (const name of route.slice(1)) {
      const wholes = new Set(found);
      const inside = await named(name);
      const held = await Promise.all(
        inside.map(async (id) =>
          (await read({ holders: id })).some(({ from, holds }) => holds && wholes.has(from)),
        ),
      );

      found = inside.filter((_, i) => held[i]);
    }

    reached.set(JSON.stringify(route), found);

    // Where a name finds several, what each is and what holds it, to say which.
    if (found.length > 1)
      for (const id of found) {
        await holonOf(id);
        const holders = (await read({ holders: id })).filter(({ holds }) => holds).map(({ from }) => from);
        const wholes = await Promise.all(holders.map(holonOf));
        holdersOf.set(id, wholes.map((whole) => whole?.name ?? whole?.id ?? "").filter(Boolean));
      }
  }

  return {
    functions: (name) => functionsNamed.get(name) ?? [],
    holons: (route) => reached.get(JSON.stringify(route)) ?? [],
    isFunction: (id) => [...functionsNamed.values()].some((each) => each.includes(id)),
    nameOf: (id) => holons.get(id)?.name,
    about(id) {
      const holon = holons.get(id);
      const held = holdersOf.get(id) ?? [];

      return `(${holon?.types.join(", ") ?? "?"})${held.length ? `, held by ${held.map((name) => JSON.stringify(name)).join(", ")}` : ", held by nothing"}`;
    },
  };
}
