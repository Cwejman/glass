// Makes the site's store from site.json: its root, and beneath it the start, what the
// page starts the engine from: the stores it offers to attach, each to be read, said as
// values, every other store this repository holds, each beside the site's own, and the
// entry it boots into, glass's by name. A holon keeps its id from one making to the next, found by
// its name, and nothing unchanged is written again.
// Usage: bun site/make.ts

import { join } from "node:path";
import { canonical } from "../integrations/glass/canonical.ts";
import type { Holon } from "../integrations/glass/store.ts";
import { localEngine } from "../engine/local.ts";
import { holonsOf, open, storeFolder, stores, typeNamed, typesOf } from "../stores.ts";

type Site = { name: string; entry: string };

const site: Site = await Bun.file(join(import.meta.dir, "site.json")).json();
const store = await open(storeFolder("site"));
const before = await holonsOf(store);
const glass = await holonsOf(await open(storeFolder("glass")));
const mint = store.minter();

const glassTypes = typesOf(glass);
const glassType = (name: string) => typeNamed(glassTypes, name);
const glassNamed = (name: string, type: string) =>
  glass.find((holon) => holon.name === name && holon.instance[0] === glassType(type))!.id;
// A holon of the site's is known by what it is and what it is called.
const idOf = (name: string, type: string | null) =>
  before.find((holon) => holon.name === name && (holon.instance[0] ?? null) === type)?.id ?? mint();

const start: Holon = {
  id: idOf("start", glassType("start")),
  instance: [glassType("start")],
  name: "start",
  body: {
    // Every other store this repository holds, each beside the site's own.
    attachments: Object.keys(stores)
      .filter((key) => key !== site.name)
      .map((key) => ({ key, from: `../${key}/` })),
    entry: { $ref: glassNamed(site.entry, "mount") },
  },
};

const dependency: Holon = {
  id: idOf("glass", glassType("dependency")),
  instance: [glassType("dependency")],
  name: "glass",
  body: { shape: { $ref: glassNamed("glass's own", "shape") } },
};

const root: Holon = {
  id: idOf(site.name, glassType("store")),
  instance: [glassType("store")],
  name: site.name,
  body: {
    shape: { $ref: glassNamed("glass's own", "shape") },
    contents: [{ $ref: start.id }],
    dependencies: [{ $ref: dependency.id }],
  },
};

// Born first, in the order minted, so they are one run.
const made = [root, start, dependency].sort((a, b) => (a.id < b.id ? -1 : 1));
const beforeById = new Map(before.map((holon) => [holon.id, canonical(holon)]));
const changed = made.filter((holon) => beforeById.get(holon.id) !== canonical(holon));

if (changed.length) {
  await (await localEngine({ writes: ["site"] })).commit({
    holons: changed,
    says: `The site's start: ${changed.map(({ name }) => name).join(", ")}`,
  });
  console.log(`${changed.length} holons written`);
} else {
  console.log("nothing changed");
}
