// Makes in the glass store what is code: each component, its code built here whole so it
// runs with nothing beside it, with what it declares of itself, and each material's
// stylesheet. A component's code is a file, and the chassis knows what to do with it (the
// author's, 2026-11-10). Everything else glass ships, its types, its functions, the kinds
// of slot, its material, the reader and the mount it boots into, lives in the store
// itself and is changed there, through the engine, as any holon is. A component keeps its
// id from one making to the next, found by its name; a new one is held with the others;
// and what has not changed is not written again.
// Usage: bun components/make.ts

import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { canonical } from "../integrations/glass/canonical.ts";
import type { Holon } from "../integrations/glass/store.ts";
import { handles } from "../engine/handles.ts";
import { localEngine } from "../engine/serve/local.ts";
import { holonsOf, open, storeFolder, typeNamed, typesOf } from "../stores.ts";

const here = import.meta.dir;

const store = await open(await storeFolder("glass"));
const before = await holonsOf(store);
const handle = handles();
const types = typesOf(before);

const ofType = (type: string) => before.filter(({ instance }) => instance[0] === typeNamed(types, type));
const component = (name: string) => ofType("component").find((holon) => holon.name === name);
const changed: Holon[] = [];

const written = (holon: Holon) => {
  const was = before.find(({ id }) => id === holon.id);
  if (!was || canonical(was) !== canonical(holon)) changed.push(holon);
};

// A component's code, built whole.
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
const born: Holon[] = [];

for (const file of readdirSync(here).filter((name) => name.endsWith(".tsx") && !name.includes(".test."))) {
  const path = join(here, file);
  const { declared } = await import(path);
  if (!declared) continue;

  const { name, ...declaration } = declared;
  const was = component(name);
  const holon: Holon = {
    id: was?.id ?? handle(),
    instance: [typeNamed(types, "component")],
    name,
    body: { ...(was?.body ?? {}), ...declaration, code: await built(path) },
  };

  if (!was) born.push(holon);
  written(holon);
}

// A new component stands with the others, in the whole that holds them.
if (born.length) {
  const whole = before.find(({ name, instance }) => name === "components" && instance.length === 0)!;
  const holds = (whole.body.holds ?? []) as unknown[];
  written({
    ...whole,
    body: { ...whole.body, holds: [...holds, ...born.map(({ id }) => ({ $ref: id, $holds: true }))] },
  });
}

// Each material's stylesheet, from the file of its name, as it is written in lower case.
for (const file of readdirSync(join(here, "materials")).filter((name) => name.endsWith(".css"))) {
  const called = basename(file, ".css");
  const material = ofType("material").find(({ name }) => name?.toLowerCase() === called);
  if (!material) throw new Error(`no material is called ${called}, for ${file}`);

  written({
    ...material,
    body: { ...material.body, css: readFileSync(join(here, "materials", file), "utf8") },
  });
}

if (changed.length) {
  const done = await (
    await localEngine({ writes: ["glass"] })
  ).commit({
    holons: changed,
    says: `The code glass ships: ${changed.map(({ name }) => name).join(", ")}`,
  });
  console.log(`${changed.length} holons written, in ${done.commit}`);
} else {
  console.log("nothing changed");
}
