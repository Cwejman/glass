// Natives kept only while functions written in the field still call them, each to go as
// those are written again upon the rest. Those that scanned every holon of the field,
// everything, types, store, search, named and since, are not carried here: no store is
// asked for every holon, so each is refused, naming what to write instead.

import { isRef, type Value } from "../../../../language/expression.ts";
import type { Calling, Native } from "./natives.ts";
import { holdersOf, references } from "./holons.ts";
import { inOrder } from "./sets.ts";
import { list } from "../values.ts";

const unread = (name: string, instead: string) => () => {
  throw new Error(`${name} scanned every holon of the field, which is not read; ${instead}`);
};

export function legacy({ field, apply }: Calling): Record<string, Native> {
  const ids = (value: unknown) => list(value).flatMap((each) => (isRef(each) ? [each.$ref] : []));

  // What the holons given connect to, down what they refer to or up what refers to them.
  const along =
    (direction: "down" | "up", holding: boolean) =>
    async ([given]: Value[]) => {
      const edges = await Promise.all(
        ids(given).map(async (id) =>
          direction === "down" ? references((await field.holon(id))?.holon.body ?? {}) : holdersOf(field, id),
        ),
      );

      return inOrder(new Set(edges.flat().flatMap((edge) => (edge.holds === holding ? [edge.id] : []))));
    };

  // What a search asked, as it was asked: lower cased, parted at its spaces.
  const asked = (text: unknown): string[] =>
    list(text).flatMap((each) =>
      typeof each === "string" ? each.toLocaleLowerCase().split(/\s+/).filter(Boolean) : [],
    );

  // What may be said of a holon as text: its name, its strings but its code, and the
  // words it holds.
  async function says(id: string) {
    const kept = await field.holon(id);
    if (!kept) return null;

    const { holon } = kept;
    const types = await Promise.all(holon.instance.map((type) => field.holon(type)));
    const code = new Set(
      types.flatMap((type) =>
        Object.entries((type?.holon.mould ?? {}) as Record<string, { shape?: unknown }>)
          .filter(([, key]) => key.shape === "code")
          .map(([key]) => key),
      ),
    );
    const said: string[] = holon.name ? [holon.name] : [];

    const walk = (value: unknown, key?: string): void => {
      if (key?.startsWith("$")) return;
      if (typeof value === "string") said.push(value);
      else if (Array.isArray(value)) value.forEach((item) => walk(item));
      else if (typeof value === "object" && value !== null)
        for (const [inner, held] of Object.entries(value)) walk(held, inner);
    };

    for (const [key, value] of Object.entries(holon.body)) if (!code.has(key)) walk(value);

    const parts = references(holon.body).filter(({ holds }) => holds);
    const held = await Promise.all(parts.map(({ id }) => field.holon(id)));
    const heldTypes = await Promise.all(
      held.map(async (each) =>
        each ? await Promise.all(each.holon.instance.map((type) => field.holon(type))) : [],
      ),
    );
    held.forEach((each, i) => {
      if (each && heldTypes[i]!.some((type) => type?.holon.name === "word"))
        said.push(String(each.holon.body.text));
    });

    return said.join(" ").toLocaleLowerCase();
  }

  return {
    says: ([holon]) => (isRef(holon) ? says(holon.$ref) : null),

    // The holons of any of the types given, asked of every store by the facts that say so.
    async type([types]) {
      const found = await Promise.all(
        ids(types).map((type) => field.facts({ a: "instance", v: { $ref: type } })),
      );
      return inOrder(new Set(found.flat().map(({ e }) => e)));
    },

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

    contains: ([text, wanted]) => {
      const said = typeof text === "string" ? text.toLocaleLowerCase() : "";
      return asked(wanted).every((word) => said.includes(word));
    },

    // How a set is looked at, read by its shape by those who ask for a way of looking;
    // worked out, each gives what it is given.
    group: ([given]) => given ?? [],
    flat: ([given]) => given ?? [],

    everything: unread("everything", "ask a pattern of what is wanted"),
    types: unread("types", "find the instances of the type type"),
    store: unread("store", "ask a pattern of what is wanted in it"),
    search: unread("search", "find what says a word with said(?h, key, word)"),
    named: unread("named", 'find by name with [?h, "name", name]'),
    since: unread("since", "read the store's log"),
  };
}
