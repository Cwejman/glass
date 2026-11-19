// The field's expressions written again as uses: every call a use of its function, held
// where it was written; every lambda a function held there, its words placeholders; and
// each function of the field given the input its takes said, and the body its gives
// was. Lists and records stay JSON, a held use at each place one was written.
//
// It runs on strata converted from the stores of record (stores/strata/convert.ts), as a
// commit through the new engine, so the earlier engine and the interface keep reading the
// stores of record in the earlier form until they move. What it writes:
//
//   the language's types: use, and the kinds of value a placeholder takes; a function
//     gaining input, body and reverse, a component input, a statistic giving a held use;
//   each native's input, from its takes;
//   each function written in the field, its gives a body over placeholders;
//   each statistic's gives, the earliest form, functions called by their names;
//   each mount a use of its component, keeping its id, its offer a list of refs;
//   each component's template a list of held uses; each board's widgets, each
//     showing a held use; and
//   the natives parse and print, a pair, each naming the other its reverse.
//
// Expressions are found where the types that hold them say, never by searching text:
// many words of the field say "call". A placeholder is optional where the field already
// gives its function fewer, so every use written still fits what it applies.

import type { Head, Holon, Store } from "../../../stores/store.ts";
import { isRef } from "../../moulds.ts";
import type { Engine } from "../engine.ts";
import type { Change } from "../commit/change.ts";
import { fieldOf, type Field } from "../read/field.ts";
import { kindNames, type Kind } from "../read/input.ts";

// The language's types by id: use, function, and the kinds of value.
export type Language = Record<"use" | "function" | Kind, string>;

// What a placeholder may be given: a kind of value, or a function.
export type Takes = Kind | "function";
export type Place = { name: string; takes: Takes[] };

type Link = { $ref: string; $holds?: boolean; $optional?: boolean };

// What writing an expression again needs: the language's types, a handle for each holon
// it makes, the native a function is, and a function by the name the earliest form
// called it by.
export type Context = {
  language: Language;
  mint(): string;
  nativeOf(fn: string): string | undefined;
  named(name: string): string;
};

// What each word around stands for, a placeholder or a pattern's variable; and the
// placeholders of a function of one's own, by place, as { arg: i } names them.
export type Around = { words: ReadonlyMap<string, unknown>; args?: readonly unknown[] };

// An expression written again: what stands where it was written, and the holons it makes.
export type Uses = { arg: unknown; holons: Holon[] };

// ---- Takes

// What each word of a takes may be given. A set is one holon or a list of them; words a
// string or a list of them; a key a field's name or a list's place.
const taking: Record<string, Takes[]> = {
  value: ["value"],
  number: ["number"],
  holon: ["holon"],
  list: ["list"],
  set: ["list", "holon"],
  words: ["string", "list"],
  key: ["string", "number"],
  store: ["string"],
  axis: ["string"],
  moment: ["string"],
  function: ["function"],
};

// The words of a takes that stand for any number given.
const many = new Set(["sets", "lists", "values", "clauses"]);

// A native's takes as the placeholders of its input, each named by its word, numbered
// where a word comes twice. One taking any number has no input: what it is given is not
// matched. A function that says nothing takes nothing.
export function takesToInput(takes: unknown): Place[] | undefined {
  const words = Array.isArray(takes) ? takes.map(String) : [];
  if (words.some((word) => many.has(word))) return undefined;

  const twice = (word: string) => words.filter((each) => each === word).length > 1;
  return words.map((word, i) => ({
    name: twice(word) ? `${word} ${words.slice(0, i + 1).filter((each) => each === word).length}` : word,
    takes: taking[word] ?? ["value"],
  }));
}

// ---- Expressions

// The natives a pattern reads as clauses of clauses.
const combining = new Set(["not", "or", "and"]);

// An expression of the earlier form written again as uses: { call, with } a use, the
// earliest { call: "name" } too; { fn, gives } a function held where it is written;
// { var } and { arg: i } the placeholders they name; { list } and { record } JSON. Within
// find a lambda is a test, its words the pattern's variables: n => gt(n, 3) is gt(?n, 3).
export function usesOf(expression: unknown, ctx: Context, around: Around = { words: new Map() }): Uses {
  const holons: Holon[] = [];
  const make = (type: string, body: Holon["body"], name?: string): Link => {
    const holon: Holon = { id: ctx.mint(), instance: [type], ...(name !== undefined && { name }), body };
    holons.push(holon);
    return { $ref: holon.id, $holds: true };
  };

  function arg(form: unknown, around: Around): unknown {
    if (form === null || typeof form !== "object") return form;
    if (Array.isArray(form)) throw new Error("a list is written { list: [ … ] }");

    const written = form as Record<string, any>;
    if ("$ref" in written) return { $ref: written.$ref };
    if ("?" in written) return { "?": written["?"] };
    if ("var" in written) {
      if (!around.words.has(written.var))
        throw new Error(`${written.var} is not a word any lambda around it takes`);
      return around.words.get(written.var);
    }
    if ("arg" in written) {
      if (!around.args) throw new Error("an argument is given only within a function of one's own");
      return around.args[written.arg] ?? null;
    }
    if ("list" in written) return written.list.map((each: unknown) => arg(each, around));
    if ("record" in written)
      return Object.fromEntries(
        Object.entries(written.record).map(([key, each]) => [key, arg(each, around)]),
      );
    if ("fn" in written) return lambda(written.fn, written.gives, around);
    if ("call" in written) {
      const fn = typeof written.call === "string" ? ctx.named(written.call) : written.call.$ref;
      const given: unknown[] = written.with ?? [];
      const pattern = ctx.nativeOf(fn) === "find";
      return make(ctx.language.use, {
        fn: { $ref: fn },
        args: given.map((each, i) => (pattern && i > 0 ? clause(each, around) : arg(each, around))),
      });
    }

    throw new Error(`not an expression: ${JSON.stringify(form).slice(0, 80)}`);
  }

  function lambda(words: string[], gives: unknown, around: Around): Link {
    const input = words.map((word) => make(ctx.language.value, {}, word));
    const within = new Map([
      ...around.words,
      ...words.map((word, i) => [word, { $ref: input[i]!.$ref }] as const),
    ]);
    return make(ctx.language.function, { input, body: arg(gives, { ...around, words: within }) });
  }

  function clause(form: unknown, around: Around): unknown {
    const written = form as Record<string, any> | null;
    if (written && typeof written === "object" && "fn" in written) {
      const words = written.fn as string[];
      return arg(written.gives, {
        ...around,
        words: new Map([...around.words, ...words.map((word) => [word, { "?": word }] as const)]),
      });
    }

    const fn =
      written && "call" in written && typeof written.call === "object" ? written.call.$ref : undefined;
    if (!fn || !combining.has(ctx.nativeOf(fn) ?? "")) return arg(form, around);

    return make(ctx.language.use, {
      fn: { $ref: fn },
      args: ((written!.with ?? []) as unknown[]).map((each) => clause(each, around)),
    });
  }

  return { arg: arg(expression, around), holons };
}

// The placeholders of an input, each a holon of what it takes, held where it is written.
export function placeholders(places: Place[], ctx: Context): { input: Link[]; holons: Holon[] } {
  const holons = places.map(({ name, takes }) => ({
    id: ctx.mint(),
    instance: takes.map((kind) => ctx.language[kind]),
    name,
    body: {},
  }));
  return { input: holons.map(({ id }) => ({ $ref: id, $holds: true })), holons };
}

// A function written in the field, its gives and takes, as its input and its body: a
// lambda's words its placeholders, each taking what the takes says at its place; any
// other expression over placeholders made from the takes, as { arg: i } named them.
export function writtenAgain(
  { gives, takes }: { gives: unknown; takes?: unknown },
  ctx: Context,
): { input: Link[]; body: unknown; holons: Holon[] } {
  const places = takesToInput(takes) ?? [];
  const lambda = gives as { fn?: unknown; gives?: unknown } | null;

  if (lambda && typeof lambda === "object" && Array.isArray(lambda.fn)) {
    const words = lambda.fn as string[];
    const made = placeholders(
      words.map((name, i) => ({ name, takes: places[i]?.takes ?? ["value"] })),
      ctx,
    );
    const placed = new Map(words.map((word, i) => [word, { $ref: made.input[i]!.$ref }] as const));
    const { arg, holons } = usesOf(lambda.gives, ctx, { words: placed });
    return { input: made.input, body: arg, holons: [...made.holons, ...holons] };
  }

  const made = placeholders(places, ctx);
  const args = made.input.map(({ $ref }) => ({ $ref }));
  const { arg, holons } = usesOf(gives, ctx, { words: new Map(), args });
  return { input: made.input, body: arg, holons: [...made.holons, ...holons] };
}

// A mount, a template's entry or a board's widget, as a use: its component applied to
// the holons it is given and what it gathers, offering what it offers, by type. One
// naming no component names no fn, for what shows it to find one.
export function mountUse(
  { component, argument, gathers, offer }: Record<string, unknown>,
  ctx: Context,
): { body: Holon["body"]; holons: Holon[] } {
  const gathered = gathers === undefined ? undefined : usesOf(gathers, ctx);
  const given = Array.isArray(argument) ? argument.filter(isRef).map(({ $ref }) => ({ $ref })) : [];
  const offered =
    offer && typeof offer === "object"
      ? Object.values(offer).flatMap((each) => (isRef(each) ? [{ $ref: each.$ref }] : []))
      : [];

  return {
    body: {
      ...(isRef(component) && { fn: { $ref: component.$ref } }),
      args: gathered ? [...given, gathered.arg] : given,
      ...(offered.length && { offer: offered }),
    },
    holons: gathered?.holons ?? [],
  };
}

// ---- The field

// The language's own types, as glass ships them.
const says = (text: string) => ({ says: text });

const useType = {
  name: "use",
  mould: {
    fn: {
      ...says("The function it applies; none where what shows it finds one by type."),
      shape: "ref",
      optional: true,
    },
    args: {
      ...says(
        "What it gives the function, in order: any JSON, a holon referred to, a use held where it is written.",
      ),
      shape: "json",
    },
    offer: {
      ...says("What it offers what it applies, each matched by its type to a placeholder left unfilled."),
      shape: { list: "ref" },
      optional: true,
    },
  },
  body: says(
    "A function applied to what it is given: a call, held in the field. It gives what its function gives.",
  ),
};

const kindSays: Record<Kind, string> = {
  value: "Any value: a placeholder of this kind takes whatever it is given.",
  number: "A number, as JSON writes one.",
  string: "A string, as JSON writes one.",
  boolean: "True or false.",
  list: "A list of values, in order.",
  record: "A record of values, by key.",
  holon: "A holon, referred to.",
};

const input = {
  ...says(
    "The placeholders it takes, in order, each held, each a hole of the types it takes; one marked $optional may be given nothing.",
  ),
  shape: { list: "ref" },
  holds: true,
  optional: true,
};

// What each known type gains, and what it lets go.
const functionMould = (mould: Record<string, unknown>) => {
  const { gives: _gives, takes: _takes, ...kept } = mould;
  return {
    ...kept,
    input,
    body: {
      ...says(
        "For a function written in the field, what it gives: JSON over its placeholders, most often a use held where it is written.",
      ),
      shape: "json",
      optional: true,
    },
    reverse: {
      ...says("The function it is the reverse of, where it is one of a pair."),
      shape: "ref",
      optional: true,
    },
  };
};

const statisticGives = {
  ...says("The use that gives it, worked out over the field wherever it is drawn; its result is never kept."),
  shape: "ref",
  holds: true,
};

const widgetsSays =
  "Its widgets in order, each a record: what it is called (says), what it shows (shows), a use of the component that draws it given what it draws, held, its settings, and how many columns it spans, one to three (span).";

const templateSays =
  "Its uses, in order, each held, each given what the component itself was given, where it is made of data: the component a use applies, or none, for what shows it to find one.";

export type Migrated = { language: Language; commits: { store: string; says: string; holons: number }[] };

// The field's expressions written again as uses, each store's own committed into it
// through the engine. The language ships in the store named; types are found by name.
// Run again over a field already written so, it writes nothing.
export async function migrate(
  engine: Engine,
  stores: ReadonlyMap<string, Store>,
  { language: ships = "glass" } = {},
): Promise<Migrated> {
  const commits: Migrated["commits"] = [];
  const commit = async (change: Omit<Change, "at">) => {
    const done = await engine.commit({ ...change, at: {} });
    if ("refused" in done)
      throw new Error(
        `${change.says} was refused:\n${done.refused.map((each) => `  ${each.id ?? ""} ${each.rule}: ${each.says}`).join("\n")}`,
      );
    commits.push({ store: change.into ?? "", says: change.says, holons: change.holons.length });
    return done.ids;
  };

  // ---- The types

  let field = await fieldAt(stores);
  const typesNamed = async (name: string) =>
    (
      await keptAll(
        field,
        (await field.facts({ a: "name", v: name })).map(({ e }) => e),
      )
    ).filter(({ holon }) => holon.mould);

  const [fnTypes, mountTypes, statisticTypes, boardTypes, componentTypes] = await Promise.all(
    ["function", "mount", "statistic", "board", "component"].map(typesNamed),
  );
  const fnType = fnTypes.find(({ store }) => store === ships)?.holon;
  if (!fnType) throw new Error(`${ships} ships no type function`);

  const shipped = async (name: string) =>
    (await typesNamed(name)).find(({ store }) => store === ships)?.holon;
  const found = Object.fromEntries(
    await Promise.all(["use", ...kindNames].map(async (name) => [name, (await shipped(name))?.id] as const)),
  );

  const mint = handles();
  const made: Holon[] = [];
  if (!found.use) made.push({ id: mint(), instance: [], ...useType });
  for (const kind of kindNames)
    if (!found[kind])
      made.push({ id: mint(), instance: [], name: kind, mould: {}, body: says(kindSays[kind]) });

  const retyped: Holon[] = [
    ...fnTypes
      .filter(({ holon }) => !("input" in holon.mould!))
      .map(({ holon }) => ({ ...holon, mould: functionMould(holon.mould!) })),
    ...componentTypes
      .filter(({ holon }) => !("input" in holon.mould!))
      .map(({ holon }) => ({
        ...holon,
        mould: {
          ...holon.mould,
          input,
          ...(holon.mould!.template !== undefined && {
            template: { ...(holon.mould!.template as object), says: templateSays },
          }),
        },
      })),
    ...statisticTypes
      .filter(({ holon }) => (holon.mould!.gives as { shape?: unknown })?.shape !== "ref")
      .map(({ holon }) => ({ ...holon, mould: { ...holon.mould, gives: statisticGives } })),
    ...boardTypes
      .filter(({ holon }) => (holon.mould!.widgets as { says?: unknown })?.says !== widgetsSays)
      .map(({ holon }) => ({
        ...holon,
        mould: { ...holon.mould, widgets: { ...(holon.mould!.widgets as object), says: widgetsSays } },
      })),
  ];

  if (made.length || retyped.length) {
    // The types made stand beside the type function, in the whole that holds it.
    const ids = await commit({
      holons: [...made, ...retyped, ...(made.length ? [await besideIn(field, fnType.id, made)] : [])],
      into: ships,
      says: "The language's types: use, and the kinds of value a placeholder takes; a function gaining its input, its body and its reverse",
    });
    for (const holon of made) found[holon.name!] = ids[holon.id];
    field = await fieldAt(stores);
  }

  const language = { ...found, function: fnType.id } as Language;

  // ---- What holds expressions

  const instancesOf = async (types: { holon: Holon }[]) =>
    keptAll(
      field,
      (await Promise.all(types.map(({ holon }) => field.facts({ a: "instance", v: { $ref: holon.id } }))))
        .flat()
        .map(({ e }) => e),
    );

  const [functions, mounts, statistics, boards, components] = await Promise.all(
    [fnTypes, mountTypes, statisticTypes, boardTypes, componentTypes].map(instancesOf),
  );
  const natives = new Map(functions.map(({ holon }) => [holon.id, holon.body.native as string | undefined]));

  // Each store's holons written again, made with handles of that store's change.
  const changes = new Map<string, { holons: Holon[]; mint: () => string }>();
  const changeOf = (store: string) => {
    if (!changes.has(store)) changes.set(store, { holons: [], mint: handles() });
    return changes.get(store)!;
  };
  // The inputs written, to be marked optional once every use is known.
  const inputs = new Map<string, Link[]>();

  // The pair parse and print, beside the language's other natives.
  if (![...natives.values()].includes("parse")) {
    const native = functions.find(({ holon, store }) => store === ships && holon.body.native);
    if (!native) throw new Error(`${ships} ships no native for parse and print to stand beside`);

    const change = changeOf(ships);
    const pair = textPair(language, change.mint);
    change.holons.push(...pair, await besideIn(field, native.holon.id, pair.slice(0, 2)));
  }

  for (const { holon, store } of functions) {
    const { gives, takes, ...body } = holon.body;
    if (gives === undefined && takes === undefined) continue;

    const change = changeOf(store);
    const ctx = contextIn(store, change.mint);
    if (gives !== undefined) {
      const written = writtenAgain({ gives, takes }, ctx);
      inputs.set(holon.id, written.input);
      change.holons.push(
        { ...holon, body: { ...body, input: written.input, body: written.body } },
        ...written.holons,
      );
      continue;
    }

    const places = takesToInput(takes);
    const made = places && placeholders(places, ctx);
    if (made) inputs.set(holon.id, made.input);
    change.holons.push(
      { ...holon, body: { ...body, ...(made && { input: made.input }) } },
      ...(made?.holons ?? []),
    );
  }

  for (const { holon, store } of mounts) {
    const change = changeOf(store);
    const use = mountUse(holon.body, contextIn(store, change.mint));
    change.holons.push({ ...holon, instance: [language.use], body: use.body }, ...use.holons);
  }

  for (const { holon, store } of statistics) {
    if (isRef(holon.body.gives)) continue;
    const change = changeOf(store);
    const { arg, holons } = usesOf(holon.body.gives, contextIn(store, change.mint));
    change.holons.push({ ...holon, body: { ...holon.body, gives: arg } }, ...holons);
  }

  for (const { holon, store } of boards) {
    const widgets = (holon.body.widgets ?? []) as Record<string, unknown>[];
    if (!widgets.some((widget) => "component" in widget || "gathers" in widget)) continue;

    const change = changeOf(store);
    const ctx = contextIn(store, change.mint);
    const shown = widgets.map(({ component, argument, gathers, offer, ...widget }) => {
      const use = mountUse({ component, argument, gathers, offer }, ctx);
      const shows = { id: ctx.mint(), instance: [language.use], body: use.body };
      change.holons.push(shows, ...use.holons);
      return { ...widget, shows: { $ref: shows.id, $holds: true } };
    });
    change.holons.push({ ...holon, body: { ...holon.body, widgets: shown } });
  }

  for (const { holon, store } of components) {
    const template = holon.body.template;
    if (!Array.isArray(template) || template.every(isRef)) continue;

    const change = changeOf(store);
    const ctx = contextIn(store, change.mint);
    const uses = template.map((entry) => {
      const use = mountUse(entry as Record<string, unknown>, ctx);
      const held = { id: ctx.mint(), instance: [language.use], body: use.body };
      change.holons.push(held, ...use.holons);
      return { $ref: held.id, $holds: true };
    });
    change.holons.push({ ...holon, body: { ...holon.body, template: uses } });
  }

  // A placeholder is optional past the fewest args any use written gives its function.
  const fewest = new Map<string, number>();
  for (const { holons } of changes.values())
    for (const { instance, body } of holons) {
      if (!instance.includes(language.use) || !isRef(body.fn)) continue;
      const given = Array.isArray(body.args) ? body.args.length : 0;
      fewest.set(body.fn.$ref, Math.min(given, fewest.get(body.fn.$ref) ?? given));
    }
  for (const [fn, input] of inputs)
    input.forEach((link, i) => {
      if (i >= (fewest.get(fn) ?? input.length)) link.$optional = true;
    });

  // The store the language ships in first, as every other's uses apply its functions.
  const order = [...changes.keys()].sort((a, b) => Number(b === ships) - Number(a === ships));
  for (const store of order)
    await commit({
      holons: changes.get(store)!.holons,
      into: store,
      says: "Expressions written again as uses: each call a use held where it was written, each lambda a function held there, each function given its input and its body",
    });

  return { language, commits };

  // How an expression of a store is written again: its handles, and a function the
  // earliest form names found among the functions by that name, the store's own first.
  function contextIn(store: string, mint: () => string): Context {
    return {
      language,
      mint,
      nativeOf: (fn) => natives.get(fn),
      named(name) {
        const called = functions.filter(({ holon }) => holon.name?.toLowerCase() === name.toLowerCase());
        const chosen = called.find((each) => each.store === store) ?? called[0];
        if (!chosen) throw new Error(`no function is called ${name}`);
        return chosen.holon.id;
      },
    };
  }
}

// The natives parse and print, each the other's reverse, and their placeholders.
function textPair(language: Language, mint: () => string): Holon[] {
  const [parse, print, text, read] = [mint(), mint(), mint(), mint()];
  const native = (name: string, says: string, input: string, reverse: string): Holon => ({
    id: name === "parse" ? parse : print,
    instance: [language.function],
    name,
    body: { native: name, says, input: [{ $ref: input, $holds: true }], reverse: { $ref: reverse } },
  });

  return [
    native(
      "parse",
      "A text read into uses: a read, { gives, holons }, its uses carried under handles, as a read gives them or a change commits them.",
      text,
      print,
    ),
    native("print", "A read, { gives, holons }, said as text: the reverse of parse.", read, parse),
    { id: text, instance: [language.string], name: "text", body: {} },
    { id: read, instance: [language.record], name: "read", body: {} },
  ];
}

// The whole holding a holon, holding beside it the holons given, in the list it holds
// it in.
export async function besideIn(field: Field, id: string, holons: readonly Holon[]): Promise<Holon> {
  const facts = await field.facts({ a: "$holds", v: { $ref: id } });
  const whole = (
    await keptAll(
      field,
      facts.map(({ e }) => e),
    )
  )[0]?.holon;
  if (!whole) throw new Error(`nothing holds ${id}`);

  const key = Object.keys(whole.body).find(
    (key) =>
      Array.isArray(whole.body[key]) && whole.body[key].some((each) => isRef(each) && each.$ref === id),
  );
  if (!key) throw new Error(`${whole.name ?? whole.id} holds ${id} in no list`);

  const held = holons.map(({ id }) => ({ $ref: id, $holds: true }));
  return { ...whole, body: { ...whole.body, [key]: [...(whole.body[key] as unknown[]), ...held] } };
}

// A handle for each holon a change brings into being, ~1 on.
export function handles() {
  let made = 0;
  return () => `~${++made}`;
}

// The field as every store stands now.
export async function fieldAt(stores: ReadonlyMap<string, Store>): Promise<Field> {
  const heads = Object.fromEntries(
    await Promise.all([...stores].map(async ([name, store]) => [name, await headOf(store)] as const)),
  );
  return fieldOf(new Map([...stores].map(([name, store]) => [name, { store }])), heads);
}

async function headOf(store: Store): Promise<Head | null> {
  const { promise, resolve } = Promise.withResolvers<Head | null>();
  const unsubscribe = await store.subscribe(resolve);
  const head = await promise;
  unsubscribe();
  return head;
}

// The holons with these ids, each once, with the store each is read from.
export async function keptAll(field: Field, ids: string[]) {
  const kept = await Promise.all([...new Set(ids)].map((id) => field.holon(id)));
  return kept.filter((each): each is NonNullable<typeof each> => Boolean(each));
}
