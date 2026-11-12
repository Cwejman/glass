// Natives kept only while functions written in the field still call them. Each can be
// written in the language upon the rest, most as patterns, which answer from the index
// faster than these scan the field; and each goes when the functions that call it are
// written so. The old search is among them: it found words within what a holon says by
// substring, where a word said is now a clause of a pattern.

import { writtenBy } from "../../../integrations/glass/store.ts";
import { isRef, ref, type Value } from "../../../language/expression.ts";
import { references } from "../../moulds.ts";
import type { Calling, Native } from "./natives.ts";
import { inOrder } from "./sets.ts";
import { list } from "../values.ts";

export function legacy({ world, apply }: Calling): Record<string, Native> {
  const keep = (test: (id: string) => boolean): Value[] => [...world.known.keys()].filter(test).map(ref);
  const ids = (value: unknown) => list(value).flatMap((each) => (isRef(each) ? [each.$ref] : []));
  const holonOf = (id: string) => world.known.get(id)?.holon;

  // What the holons given connect to, down what they refer to or up what refers to them.
  const along =
    (direction: "down" | "up", holding: boolean) =>
    ([given]: Value[]) => {
      const reached = new Set<string>();

      for (const id of ids(given)) {
        const holon = holonOf(id);
        const edges =
          direction === "down"
            ? holon
              ? references(holon.body, world.mouldFor(holon))
              : []
            : world.holders(id).map(({ from, key, holds }) => ({ id: from, key, holds }));

        for (const edge of edges) if (edge.holds === holding) reached.add(edge.id);
      }

      return inOrder(world.place, reached);
    };

  // What a search asked, as it was asked: lower cased, parted at its spaces.
  const asked = (text: unknown): string[] =>
    list(text).flatMap((each) =>
      typeof each === "string" ? each.toLocaleLowerCase().split(/\s+/).filter(Boolean) : [],
    );

  const isNamed = (names: string[]) => (instance: string[]) =>
    instance.some((type) => names.includes(holonOf(type)?.name ?? ""));
  const isWord = isNamed(["word"]);
  const isWordLike = isNamed(["word", "lexeme"]);

  // What may be said of a holon as text: its name, its strings but its code, and the
  // words it holds.
  const saying = new Map<string, string>();
  function says(id: string) {
    if (saying.has(id)) return saying.get(id)!;

    const holon = holonOf(id)!;
    const mould = world.mouldFor(holon);
    const said: string[] = holon.name ? [holon.name] : [];

    const walk = (value: unknown, key?: string): void => {
      if (key?.startsWith("$")) return;
      if (typeof value === "string") said.push(value);
      else if (Array.isArray(value)) value.forEach((item) => walk(item));
      else if (typeof value === "object" && value !== null)
        for (const [inner, held] of Object.entries(value)) walk(held, inner);
    };

    for (const [key, value] of Object.entries(holon.body)) if (mould[key]?.shape !== "code") walk(value);
    for (const { id: part, holds } of references(holon.body, mould)) {
      const held = holds ? holonOf(part) : undefined;
      if (held && isWord(held.instance)) said.push(held.body.text);
    }

    const text = said.join(" ").toLocaleLowerCase();
    saying.set(id, text);
    return text;
  }

  return {
    type: ([types]) => {
      const wanted = new Set(ids(types));
      return keep((id) => holonOf(id)!.instance.some((type) => wanted.has(type)));
    },
    types: () => keep((id) => holonOf(id)!.mould !== undefined),
    store: ([key]) => keep((id) => world.storesOf(id).includes(String(key))),
    stores: () => [...new Set([...world.known.keys()].flatMap((id) => world.storesOf(id)))],
    children: along("down", true),
    parents: along("up", true),
    points: along("down", false),
    pointers: along("up", false),

    first: ([items]) => list(items)[0] ?? null,
    last: ([items]) => list(items).at(-1) ?? null,
    size: ([items]) => list(items).length,
    take: ([items, n]) => list(items).slice(0, Number(n)),
    skip: ([items, n]) => list(items).slice(Number(n)),
    apply: ([fn, ...given]) => apply(fn, given),

    search: ([text]) => {
      const wanted = asked(text);
      if (!wanted.length) return [];
      return keep(
        (id) => !isWordLike(holonOf(id)!.instance) && wanted.every((word) => says(id).includes(word)),
      );
    },
    named: ([text]) => {
      const wanted = asked(text);
      if (!wanted.length) return [];
      return keep((id) => {
        const name = holonOf(id)!.name?.toLocaleLowerCase();
        return name !== undefined && wanted.every((word) => name.includes(word));
      });
    },
    contains: ([text, wanted]) => {
      const said = typeof text === "string" ? text.toLocaleLowerCase() : "";
      return asked(wanted).every((word) => said.includes(word));
    },
    says: ([holon]) => (isRef(holon) && holonOf(holon.$ref) ? says(holon.$ref) : null),

    since: ([store, moment]) => {
      const written = new Set(
        world
          .log(String(store))
          .filter(({ at }) => at > String(moment))
          .flatMap(writtenBy),
      );
      return keep((id) => written.has(id) && world.storesOf(id).includes(String(store)));
    },

    // How a set is looked at, read by its shape by those who ask for a way of looking;
    // worked out, each gives what it is given.
    group: ([given]) => given ?? [],
    flat: ([given]) => given ?? [],
  };
}
