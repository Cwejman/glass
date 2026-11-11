// Makes the glass store: what the client ships, as holons. Its types, its functions,
// the kinds of slot, its material, its components with their code built here, and the
// mount it boots into. A holon keeps its name from one making to the next, found by
// what it is called, and one that has not changed is not written again.
// Usage: bun components/make.ts

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse, type Names } from "../language/text.ts";
import { canonical } from "../integrations/glass/canonical.ts";
import { commit, type Holon } from "../integrations/glass/store.ts";
import { holonsOf, open, storeFolder } from "../stores.ts";

const here = import.meta.dir;
const json = (path: string) => JSON.parse(readFileSync(join(here, path), "utf8"));

const store = await open(storeFolder("glass"));
const before = await holonsOf(store);
const mint = store.minter();

// A holon is known by what it is and what it is called: a function and a component
// may share a title, as Type does.
const whatItIs = (holon: Holon) =>
  holon.mould
    ? "type"
    : holon.instance.length
      ? before.find(({ id }) => id === holon.instance[0])?.name
      : "whole";

const nameOf = new Map(before.map((holon) => [`${whatItIs(holon)}: ${holon.name}`, holon.id]));

function named(type: string, name: string) {
  const key = `${type}: ${name}`;
  let id = nameOf.get(key);

  if (!id) {
    id = mint();
    nameOf.set(key, id);
  }

  return id;
}

const made: Holon[] = [];

function make(type: string, name: string, body: Holon["body"], mould?: Holon["mould"]) {
  made.push({
    id: named(type, name),
    instance: type === "type" || type === "whole" ? [] : [named("type", type)],
    name,
    ...(mould ? { mould } : {}),
    body,
  });
}

for (const file of readdirSync(join(here, "types"))) {
  const { name, says, mould } = json(`types/${file}`);
  make("type", name, says ? { says } : {}, mould);
}

// A function is native, or written in the language, in a file of its own, and read
// here into the expression it gives; it may call itself, and any function, by name.
const functions = json("functions.json") as { name: string; written?: string }[];

for (const { name } of functions) named("function", name);

const functionNames: Names = {
  functions: (name) => (functions.some((fn) => fn.name === name) ? [named("function", name)] : []),
  holons: () => [],
  isFunction: () => true,
  nameOf: (id) => functions.find(({ name }) => nameOf.get(`function: ${name}`) === id)?.name,
};

for (const { name, written, ...body } of functions) {
  const gives = written
    ? { gives: parse(readFileSync(join(here, "functions", written), "utf8"), functionNames) }
    : {};

  make("function", name, { ...body, ...gives });
}

for (const { name, says } of json("kinds.json")) make("kind", name, { says });

for (const { name, says, file } of json("materials.json")) {
  make("material", name, { says, css: readFileSync(join(here, "materials", file), "utf8") });
}

// A component's code is built here, whole, so it runs with nothing beside it.
async function built(path: string) {
  const { success, outputs, logs } = await Bun.build({
    entrypoints: [path],
    format: "esm",
    target: "browser",
  });
  if (!success) throw new AggregateError(logs, `building ${path}`);

  return outputs[0]!.text();
}

// What declares itself is a component; the rest are what components are made with.
for (const file of readdirSync(here).filter((name) => name.endsWith(".tsx") && !name.includes(".test."))) {
  const path = join(here, file);
  const { declared } = await import(path);

  if (!declared) continue;

  const { name, ...body } = declared;
  make("component", name, { ...body, code: await built(path) });
}

const refTo = (name: string) => ({ $ref: named("component", name) });

const { name: readerName, template, ...reader } = json("reader.json");

make("component", readerName, {
  ...reader,
  template: template.map(({ component }: { component?: string }) =>
    component ? { component: refTo(component) } : {},
  ),
});

// The mount the client boots into names no content: it looks at what is attached,
// the stores the field is. A site that wants to open on its own words ships its own entry.
const { name: entryName, component, gathers, offer } = json("entry.json");

make("mount", entryName, {
  component: refTo(component),
  gathers: {
    call: { $ref: named("function", gathers.function) },
    with: gathers.types.map((type: string) => ({ $ref: named("type", type) })),
  },
  // What the entry offers is what everything beneath it looks for: the search, and the
  // functions, components, types and material glass ships, each by reference.
  offer: Object.fromEntries(
    Object.entries(offer as Record<string, [string, string]>).map(([key, [type, name]]) => [
      key,
      { $ref: named(type, name) },
    ]),
  ),
});

// Holons of a kind stand together in a whole made for it, so the store's top is few,
// and an address can go through them. Each reference says for itself that it holds.
for (const [name, kind] of [
  ["types", "type"],
  ["functions", "function"],
  ["kinds", "kind"],
  ["components", "component"],
] as const) {
  const holds = made
    .filter(({ mould, instance }) =>
      kind === "type" ? mould !== undefined : instance[0] === nameOf.get(`type: ${kind}`),
    )
    .map(({ id }) => ({ $ref: id, $holds: true }));

  make("whole", name, { holds });
}

const beforeById = new Map(before.map((holon) => [holon.id, canonical(holon)]));
const changed = made.filter((holon) => beforeById.get(holon.id) !== canonical(holon));

if (changed.length) {
  const { blocks, bytes } = await commit(store, {
    holons: changed,
    says: `The field glass ships: ${changed.map(({ name }) => name).join(", ")}`,
  });
  console.log(`${changed.length} holons written, ${blocks} blocks, ${bytes} bytes`);
} else {
  console.log("nothing changed");
}
