// What the interface draws with, shipped in glass: the components, each declaring what
// it takes; the natives the interface reads by; the search bar as data; and the functions
// written in the language it reads by. It runs in the build after migrate.ts, as commits
// through the engine, into the store the language ships in. What it writes:
//
//   the component type reshaped to declare only: what it says, its input, and, for a
//     component made of data, its body; the type direction, and its two, row and column;
//   the natives holon, whole, quote, back, each, and steps and chain, a pair;
//   the components realized in code, each declaring what it takes and nothing more:
//     Value, List, Answer, ExpressionInput, Pill, Choose, Problem, and Brief, given a
//     brief;
//   the components realized nowhere taken out, the uses applying them left to find one
//     by type, and Reader's template with them; and
//   Reader and Search, components of data, their bodies written below in the language;
//   and sections, wholes, roots, is and taking, functions written in the language, one
//     commit each.
//
// Which code realizes a component is the web components' own (components/web/realized.ts);
// a component holon only declares. What exists is found by name in the store, and kept.

import type { Holon, Store } from "../../stores/store.ts";
import { namesUsed, syntax, toRead } from "../../language/text.ts";
import { isRef } from "../moulds.ts";
import type { Change } from "../commit/change.ts";
import type { Engine } from "../engine.ts";
import type { Field } from "../read/field.ts";
import { namesOver } from "../read/names.ts";
import { besideIn, fieldAt, handles, keptAll } from "./migrate.ts";

// The components of data, as their bodies read: each a lambda over the text searched.
const written = {
  Search: `text => List([
    text | parse | steps | each(Pill) | List(@glass:interface/row),
    ExpressionInput(text)
  ], @glass:interface/row)`,
  Reader: "text => List([Search(text), Answer(parse(text))])",
};

// The functions the interface reads by, written in the language upon the natives, each
// with the type its placeholder takes, where it takes one.
const functions = {
  sections: {
    takes: "brief",
    text: `b => [b] | follow(x => x.parts) | map(e => e.to) | concat([b]) | map(s => whole(s, ["brief"]))`,
  },
  wholes: {
    takes: "holon",
    text: `h => [h] | follow(x => in(x) | filter(e => e.holds) | map(e => e.from) | take(1), {depth: 24}) | map(e => e.to) | reverse | concat([h])`,
  },
  roots: { takes: undefined, text: `() => find(?s, [?s, "instance", ?t], [?t, "name", "store"])` },
  is: { takes: undefined, text: `(h, type) => and(eq(kind(h), "holon"), has(h.instance, type))` },
  taking: {
    takes: "list",
    text: `(given, among) => among | filter(c => takes(c, given) | map(b => get(b.place, "instance") | map(t => is(b.given, t)) | has(true)) | has(true))`,
  },
};

const says = {
  component:
    "A function drawn rather than worked out: what it draws in a sentence, the placeholders it takes, and, made of data, the body it draws; the code that draws one is each surface's own.",
  Reader: "What one is looking at: the search for it, above what it gives.",
  Search: "A text searched by: its steps as pills, each to be taken out, beside the text typed into.",
  Answer: "A read, drawn as what it gives, again whenever that changes.",
  ExpressionInput: "A text, typed into: each keystroke proposed back as what it is given.",
  Pill: "A step of a read, said as text, which may be taken out of the read.",
  List: "A list, each item drawn in turn by what draws it: in a column, or in a row where it is given one.",
  Choose: "The components that could draw a value, for the one drawing it to be chosen: none is guessed.",
  Problem:
    "What failed, said in place of the drawing that failed: drawn by the chassis wherever what a drawing is given, a read it asked, or its making fails.",
  Brief:
    "A brief: its name, its flow, and its sections read through after it, each with the flow of its own.",
  wholes:
    "Where a holon stands: the wholes holding it, from the top of its store down, at each step the first whole that holds it, and the holon itself last; at most 24 steps up.",
  roots: "The stores by their roots: each store's one holon of the type store, which holds its top.",
  is: "Whether a holon is an instance of the type given; anything else is not.",
  taking:
    "Of the functions or components among those given, those that take what is given, as a use giving it would be judged, and by a type of the field: some placeholder takes something given of a type it takes. One taking only kinds of value is never found so.",
  sections:
    "A brief and each brief it holds as a section, beneath it at any depth, each read as a whole entering no brief, so a brief standing in a flow is read but not entered: the wholes.",
  direction: "Which way a list runs: in a row, or in a column.",
  row: "Side by side, wrapping where there is no room.",
  column: "One under another.",
};

// What a component declares, and nothing more: its code is the chassis's own.
const declares = ["says", "input", "body"];

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
  // A kind is a type of an empty mould: the prose's list is no kind.
  const isKind = (holon: Holon) => isType(holon) && !Object.keys(holon.mould!).length;
  const [componentType, functionType] = await Promise.all(
    ["component", "function"].map((name) => required(name, isType)),
  );
  const kinds = Object.fromEntries(
    await Promise.all(
      ["value", "number", "string", "list", "record", "holon"].map(
        async (name) => [name, (await required(name, isKind)).id] as const,
      ),
    ),
  );
  const isComponent = (holon: Holon) => holon.instance.includes(componentType!.id);
  // A type of any store, by its name, as a placeholder's type may be.
  const typeNamed = async (name: string) => {
    const found = await keptAll(
      field,
      (await field.facts({ a: "name", v: name })).map(({ e }) => e),
    );
    const type = found.find(({ holon }) => isType(holon))?.holon;
    if (!type) throw new Error(`no store holds the type ${name}`);
    return type;
  };
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

    // The component type declares only: its other keys go, from the type and from each
    // component kept.
    const declaring = (body: Holon["body"]) =>
      Object.fromEntries(Object.entries(body).filter(([key]) => declares.includes(key)));
    const reshaped: Holon = {
      ...componentType!,
      body: { ...componentType!.body, says: says.component },
      mould: { ...declaring(componentType!.mould!), body: bodyOfData },
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
      native(
        "whole",
        "A holon and what it holds, down to a depth, entering no holon of the types named in stop, though reading it: { root, holons }, each holon as holon reads it.",
        [
          placeholder("holon", kinds.holon!),
          placeholder("depth", kinds.number!, true),
          placeholder("stop", kinds.list!, true),
        ],
      ),
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

    // A component as declared: the one by its name kept, saying only what it declares,
    // or a new one.
    const value = await required("Value", isComponent);
    const declared = async (name: string, body: Holon["body"]): Promise<Holon> => {
      const kept = await named(name, isComponent);
      return {
        ...(kept ?? { id: mint(), instance: [componentType!.id], name }),
        body: { ...declaring(kept?.body ?? {}), ...body },
      };
    };
    const components = [
      await declared("Value", { input: [placeholder("value", kinds.value!)] }),
      await declared("List", {
        says: says.List,
        input: [placeholder("items", kinds.list!), placeholder("direction", direction.id, true)],
      }),
      await declared("Answer", { says: says.Answer, input: [placeholder("read", kinds.record!)] }),
      await declared("ExpressionInput", {
        says: says.ExpressionInput,
        input: [placeholder("text", kinds.string!)],
      }),
      await declared("Pill", { says: says.Pill, input: [placeholder("step", kinds.record!)] }),
      await declared("Choose", {
        says: says.Choose,
        input: [placeholder("components", kinds.list!), placeholder("value", kinds.value!)],
      }),
      await declared("Problem", { says: says.Problem, input: [placeholder("problem", kinds.string!)] }),
      await declared("Brief", {
        says: says.Brief,
        input: [placeholder("brief", (await typeNamed("brief")).id)],
      }),
      await declared("Search", { says: says.Search }),
      await declared("Reader", { says: says.Reader }),
    ];
    const born = (holons: Holon[]) => holons.filter(({ id }) => id.startsWith("~"));
    const parse = await required("parse", isFunction);

    // The components realized nowhere go: a use applying one names none, to find one by
    // type; and Reader's template goes with what it held.
    const declaredNow = new Set(components.map(({ id }) => id));
    const kept = (
      await keptAll(
        field,
        (await field.facts({ a: "instance", v: { $ref: componentType!.id } })).map(({ e }) => e),
      )
    ).map(({ holon }) => holon);
    const going = kept.filter(({ id }) => !declaredNow.has(id)).map(({ id }) => id);
    const template = (kept.find(({ name }) => name === "Reader")?.body.template ?? []) as unknown[];
    const templated = template.filter(isRef).map(({ $ref }) => $ref);
    const applying = await keptAll(
      field,
      (await Promise.all(going.map((id) => field.facts({ a: "fn", v: { $ref: id } }))))
        .flat()
        .map(({ e }) => e),
    );
    const unnamed = applying
      .filter(({ holon }) => !templated.includes(holon.id))
      .map(({ holon: { body, ...use } }) => ({ ...use, body: withoutKey(body, "fn") }));
    const gone = new Set(going);
    const holder = await besideIn(field, value.id, born(components));
    const holding = {
      ...holder,
      body: Object.fromEntries(
        Object.entries(holder.body).map(([key, held]) => [
          key,
          Array.isArray(held) ? held.filter((each) => !(isRef(each) && gone.has(each.$ref))) : held,
        ]),
      ),
    };

    await commit({
      holons: [
        reshaped,
        ...directions,
        await besideIn(field, componentType!.id, directions),
        ...natives,
        await besideIn(field, parse.id, natives),
        ...components,
        holding,
        ...unnamed,
        ...made,
      ],
      gone: [...going, ...templated],
      says: "The interface's components, each declaring only what it takes; those realized nowhere taken out; the natives it reads by; and the way a list runs",
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
    field = await fieldAt(stores);
  }

  // ---- The functions written in the language

  for (const [name, { takes, text }] of Object.entries(functions)) {
    if (await named(name, isFunction)) continue;
    const mint = handles();
    const type =
      takes === "holon" || takes === "list"
        ? kinds[takes]!
        : takes
          ? (await typeNamed(takes)).id
          : kinds.value!;
    const { input, body, carried } = await lambdaOf(field, text, mint, type);
    const made: Holon = {
      id: mint(),
      instance: [functionType!.id],
      name,
      body: { says: says[name as keyof typeof functions], input, body },
    };

    await commit({
      holons: [made, ...carried, await besideIn(field, (await required("whole", isFunction)).id, [made])],
      says: `${name}, written in the language upon the natives`,
    });
    field = await fieldAt(stores);
  }

  return { commits };
}

const withoutKey = (body: Holon["body"], key: string) =>
  Object.fromEntries(Object.entries(body).filter(([each]) => each !== key));

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
