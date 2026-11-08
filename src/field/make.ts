// Makes the glass store: what the client ships, as holons. Its types, its functions,
// the kinds of slot, its material, its components with their code built here, and the
// mount it boots into. A holon keeps its name from one making to the next, found by
// what it is called, and one that has not changed is not written again.
// Usage: bun field/make.ts

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canonical } from "../store/canonical.ts";
import { commit, type Holon } from "../store/store.ts";
import { holonsOf, open, storeDir } from "../tools/stores.ts";

const here = import.meta.dir;
const json = (path: string) => JSON.parse(readFileSync(join(here, path), "utf8"));

const store = await open(join(storeDir, "glass"));
const before = await holonsOf(store);
const mint = store.minter();

// A holon is known by what it is and what it is called: a function and a component
// may share a title, as Type does.
const whatItIs = (holon: Holon) =>
  holon.mould ? "type" : before.find(({ id }) => id === holon.instance[0])?.name;

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
    instance: type === "type" ? [] : [named("type", type)],
    name,
    ...(mould ? { mould } : {}),
    body,
  });
}

for (const file of readdirSync(join(here, "types"))) {
  const { name, says, mould } = json(`types/${file}`);
  make("type", name, says ? { says } : {}, mould);
}

for (const { name, ...body } of json("functions.json")) make("function", name, body);

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

const componentDir = join(here, "components");

// What declares itself is a component; the rest are what components are made with.
for (const file of readdirSync(componentDir).filter(
  (name) => name.endsWith(".tsx") && !name.includes(".test."),
)) {
  const path = join(componentDir, file);
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

const { name: entryName, component, argument, offer } = json("entry.json");

make("mount", entryName, {
  component: refTo(component),
  argument: argument.map(($ref: string) => ({ $ref })),
  offer: Object.fromEntries(Object.entries(offer).map(([key, value]) => [key, refTo(value as string)])),
});

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
