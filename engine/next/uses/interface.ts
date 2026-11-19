// What the interface draws with, shipped in glass: the components, each declaring what
// it takes; the natives the interface reads by; and the search bar as data. It runs in
// the build after migrate.ts, as two commits through the new engine, into the store the
// language ships in. What it writes:
//
//   the component type given a body, for a component made of data, and its kinds and
//     takes made optional; the type direction, and its two, row and column;
//   the natives holon, quote, back, each, and steps and chain, a pair;
//   the components realized in code, each given its input: Value, List, Answer,
//     ExpressionInput and Pill, all but Value drawn only where a use names them; and
//   Reader and Search, components of data, their bodies written below in the language.
//
// Which code realizes a component is the chassis's own (interface/web/realized.ts); a
// component holon only declares. What exists is found by name in the store, and kept.

import type { Holon, Store } from "../../../stores/store.ts";
import { namesUsed, syntax, toRead } from "../../../language/text.ts";
import { isRef } from "../../moulds.ts";
import type { Change } from "../commit/change.ts";
import type { Engine } from "../engine.ts";
import type { Field } from "../read/field.ts";
import { namesOver } from "../read/names.ts";
import { besideIn, fieldAt, handles, keptAll } from "./migrate.ts";

// The components of data, as their bodies read: each a lambda over the text searched.
const written = {
  Search: `text => List([
    text | parse | steps | each(Pill) | List(@glass:types/row),
    ExpressionInput(text)
  ], @glass:types/row)`,
  Reader: "text => List([Search(text), Answer(parse(text))])",
};

const says = {
  Reader: "What one is looking at: the search for it, above what it gives.",
  Search: "A text searched by: its steps as pills, each to be taken out, beside the text typed into.",
  Answer: "A read, drawn as what it gives, again whenever that changes.",
  ExpressionInput: "A text, typed into: each keystroke proposed back as what it is given.",
  Pill: "A step of a read, said as text, which may be taken out of the read.",
  List: "A list, each item drawn in turn by what draws it: in a column, or in a row where it is given one.",
  direction: "Which way a list runs: in a row, or in a column.",
  row: "Side by side, wrapping where there is no room.",
  column: "One under another.",
};

const bodyOfData = {
  says: "For a component made of data, what it draws: most often a use held where it is written, over its placeholders.",
  shape: "json",
  optional: true,
};

export type Shipped = { commits: { store: string; says: string; holons: number }[] };

// The interface's components and natives, and the search bar as data, committed into
// the store the language ships in. Run again over a field already so, it writes nothing.
export async function shipInterface(
  engine: Engine,
  stores: ReadonlyMap<string, Store>,
  { into: ships = "glass" } = {},
): Promise<Shipped> {
  const commits: Shipped["commits"] = [];
  const commit = async (change: Omit<Change, "at" | "into">) => {
    const done = await engine.commit({ ...change, into: ships, at: {} });
    if ("refused" in done)
      throw new Error(
        `${change.says} was refused:\n${done.refused.map((each) => `  ${each.id ?? ""} ${each.rule}: ${each.says}`).join("\n")}`,
      );
    commits.push({ store: ships, says: change.says, holons: change.holons.length });
  };

  let field = await fieldAt(stores);
  const named = async (name: string, is: (holon: Holon) => boolean = () => true) =>
    (
      await keptAll(
        field,
        (await field.facts({ a: "name", v: name })).map(({ e }) => e),
      )
    ).find(({ holon, store }) => store === ships && is(holon))?.holon;
  const required = async (name: string, is?: (holon: Holon) => boolean) => {
    const found = await named(name, is);
    if (!found) throw new Error(`${ships} ships no ${name}`);
    return found;
  };

  const isType = (holon: Holon) => Boolean(holon.mould);
  const [componentType, functionType] = await Promise.all(
    ["component", "function"].map((name) => required(name, isType)),
  );
  const kinds = Object.fromEntries(
    await Promise.all(
      ["value", "number", "string", "list", "record", "holon"].map(
        async (name) => [name, (await required(name, isType)).id] as const,
      ),
    ),
  );
  const isComponent = (holon: Holon) => holon.instance.includes(componentType!.id);
  const isFunction = (holon: Holon) => holon.instance.includes(functionType!.id);

  // ---- The components and natives

  if (!(await named("Pill", isComponent))) {
    const mint = handles();
    const made: Holon[] = [];
    const placeholder = (name: string, type: string, optional = false) => {
      const holon: Holon = { id: mint(), instance: [type], name, body: {} };
      made.push(holon);
      return { $ref: holon.id, $holds: true, ...(optional && { $optional: true }) };
    };

    const direction: Holon = {
      id: mint(),
      instance: [],
      name: "direction",
      mould: { says: { says: "What it means.", shape: "string" } },
      body: { says: says.direction },
    };
    const way = (name: "row" | "column"): Holon => ({
      id: mint(),
      instance: [direction.id],
      name,
      body: { says: says[name] },
    });
    const directions = [direction, way("row"), way("column")];

    const mould = componentType!.mould!;
    const optional = (key: string) =>
      mould[key] === undefined ? {} : { [key]: { ...(mould[key] as object), optional: true } };
    const reshaped: Holon = {
      ...componentType!,
      mould: { ...mould, ...optional("kinds"), ...optional("takes"), body: bodyOfData },
    };

    const native = (name: string, about: string, input: unknown[], body: Holon["body"] = {}): Holon => ({
      id: mint(),
      instance: [functionType!.id],
      name,
      body: { native: name, says: about, input, ...body },
    });
    const [steps, chain] = [mint(), mint()];
    const natives = [
      ...((await named("holon", isFunction))
        ? []
        : [
            native("holon", "A holon as it is kept: its id, name, store, types and body.", [
              placeholder("holon", kinds.holon!),
            ]),
          ]),
      native("quote", "A value as it is written, nothing in it worked out: data given as it is.", [
        placeholder("value", kinds.value!),
      ]),
      native(
        "back",
        "The way back: the change that would make the drawing standing at the uses given be given the value at the place given, or null where there is none.",
        [
          placeholder("at", kinds.list!),
          placeholder("place", kinds.number!),
          placeholder("value", kinds.value!),
        ],
      ),
      native(
        "each",
        "A list, each item given to a function, as map gives it; what each gives may be taken back to the item it was given.",
        [placeholder("list", kinds.list!), placeholder("function", functionType!.id)],
      ),
      {
        ...native(
          "steps",
          "A read's steps: its pipe chain, each step a read of its own, the use it adds without what was piped into it.",
          [placeholder("read", kinds.record!)],
          { reverse: { $ref: chain } },
        ),
        id: steps,
      },
      {
        ...native(
          "chain",
          "Steps joined into one read, each given the one before it: the reverse of steps.",
          [placeholder("steps", kinds.list!)],
          { reverse: { $ref: steps } },
        ),
        id: chain,
      },
    ];

    // A component as declared: the one by its name kept, or a new one.
    const value = await required("Value", isComponent);
    const declared = async (name: string, body: Holon["body"]): Promise<Holon> => {
      const kept = await named(name, isComponent);
      return {
        ...(kept ?? { id: mint(), instance: [componentType!.id], name }),
        body: { ...kept?.body, ...body },
      };
    };
    const only = { named: true };
    const components = [
      await declared("Value", { input: [placeholder("value", kinds.value!)] }),
      await declared("List", {
        says: says.List,
        input: [placeholder("items", kinds.list!), placeholder("direction", direction.id, true)],
        ...only,
      }),
      await declared("Answer", { says: says.Answer, input: [placeholder("read", kinds.record!)], ...only }),
      await declared("ExpressionInput", {
        says: says.ExpressionInput,
        input: [placeholder("text", kinds.string!)],
        ...only,
      }),
      await declared("Pill", { says: says.Pill, input: [placeholder("step", kinds.record!)], ...only }),
      await declared("Search", { says: says.Search, ...only }),
      await declared("Reader", { says: says.Reader, ...only }),
    ];
    const born = (holons: Holon[]) => holons.filter(({ id }) => id.startsWith("~"));
    const parse = await required("parse", isFunction);

    await commit({
      holons: [
        reshaped,
        ...directions,
        await besideIn(field, componentType!.id, directions),
        ...natives,
        await besideIn(field, parse.id, natives),
        ...components,
        ...(born(components).length ? [await besideIn(field, value.id, born(components))] : []),
        ...made,
      ],
      says: "The interface's components, each declaring what it takes; the natives it reads by; and the way a list runs",
    });
    field = await fieldAt(stores);
  }

  // ---- The components of data

  const search = await required("Search", isComponent);
  if (search.body.body === undefined) {
    const mint = handles();
    const holons: Holon[] = [];
    for (const [name, text] of Object.entries(written)) {
      const component = await required(name, isComponent);
      const { input, body, carried } = await lambdaOf(field, text, mint, kinds.string!);
      holons.push({ ...component, body: { ...component.body, input, body } }, ...carried);
    }

    await commit({
      holons,
      says: "Reader and Search made of data: the search bar a list of a text's steps, as pills, beside the text typed into",
    });
  }

  return { commits };
}

// A lambda written in the language read into uses: its placeholders, each of the type
// given, what it gives, and the holons both hold, under handles of the change.
async function lambdaOf(field: Field, text: string, mint: () => string, type: string) {
  const read = toRead(syntax(text), await namesOver(field, namesUsed(text)));
  const handle = new Map((read.holons ?? []).map(({ id }) => [id, mint()]));
  const rehandled = (value: unknown): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(rehandled);
    if (isRef(value) && handle.has(value.$ref)) return { ...value, $ref: handle.get(value.$ref) };
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, rehandled(inner)]));
  };

  const lambda = isRef(read.gives)
    ? read.holons?.find(({ id }) => id === (read.gives as { $ref: string }).$ref)
    : undefined;
  if (!lambda || !Array.isArray(lambda.body.input)) throw new Error(`${text} is not a lambda`);

  const placeholders = new Set(lambda.body.input.filter(isRef).map(({ $ref }) => $ref));
  const carried = (read.holons ?? [])
    .filter(({ id }) => id !== lambda.id)
    .map((holon) => ({
      ...holon,
      id: handle.get(holon.id)!,
      ...(placeholders.has(holon.id) && { instance: [type] }),
      body: rehandled(holon.body) as Holon["body"],
    }));
  return { input: rehandled(lambda.body.input), body: rehandled(lambda.body.body), carried };
}
