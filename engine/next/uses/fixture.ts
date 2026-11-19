// For tests: the least of glass the interface ships over, in one store mounted as glass,
// with two notes, the first referring to the second, and a text to read; and an engine over it, the
// interface shipped (interface.ts).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sameThread } from "../../../runtime/runtime.ts";
import { contentOf, hashOf, partOf } from "../../../stores/act.ts";
import type { Act, Holon, Store } from "../../../stores/store.ts";
import { folderStorage } from "../../../stores/strata/storage/folder.ts";
import { strata } from "../../../stores/strata/strata.ts";
import { engine, type Engine } from "../engine.ts";
import { shipInterface } from "./interface.ts";

export const id = (n: number) => String(n).padStart(15, "0");

const declared = { says: "Any JSON.", shape: "json", optional: true };
const held = (n: number) => ({ $ref: id(n), $holds: true });
const kinds = ["value", "number", "string", "list", "record", "holon"];
const natives = ["get", "parse", "print", "add", "map", "size"];

export const notes = { first: id(80), second: id(81), query: id(82) };

export const glass: Holon[] = [
  {
    id: id(1),
    instance: [],
    name: "function",
    mould: { native: declared, says: declared, input: declared, body: declared, reverse: declared },
    body: {},
  },
  { id: id(2), instance: [], name: "use", mould: { fn: declared, args: declared }, body: {} },
  {
    id: id(3),
    instance: [],
    name: "component",
    mould: { says: declared, input: declared, named: declared },
    body: {},
  },
  {
    id: id(4),
    instance: [],
    name: "store",
    mould: {
      shape: { says: "Its shape.", shape: "ref" },
      contents: { says: "What it holds.", shape: { set: "ref" }, holds: true },
    },
    body: {},
  },
  {
    id: id(5),
    instance: [],
    name: "shape",
    mould: { admits: { says: "What it admits.", shape: { set: "ref" }, optional: true } },
    body: {},
  },
  ...kinds.map((name, i) => ({ id: id(10 + i), instance: [], name, mould: {}, body: {} })),
  ...natives.map((name, i) => ({
    id: id(20 + i),
    instance: [id(1)],
    name,
    body: {
      native: name,
      ...(name === "parse" && { reverse: { $ref: id(22) } }),
      ...(name === "print" && { reverse: { $ref: id(21) } }),
    },
  })),
  { id: id(30), instance: [id(3)], name: "Value", body: { says: "Any value, as what it is." } },
  {
    id: id(40),
    instance: [],
    name: "types",
    body: { holds: [1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 15].map(held) },
  },
  { id: id(41), instance: [], name: "functions", body: { holds: [20, 21, 22, 23, 24, 25].map(held) } },
  { id: id(42), instance: [], name: "components", body: { holds: [held(30)] } },
  {
    id: notes.first,
    instance: [],
    name: "First",
    body: { text: "Glass holds holons", see: { $ref: notes.second } },
  },
  { id: notes.second, instance: [], name: "Second", body: {} },
  { id: notes.query, instance: [], name: "query", body: { text: "1 | add(2) | add(3)" } },
  {
    id: id(90),
    instance: [id(4)],
    name: "glass",
    body: { shape: { $ref: id(91) }, contents: [40, 41, 42, 80, 81, 82].map(held) },
  },
  { id: id(91), instance: [id(5)], name: "glass's own", body: {} },
];

const made: string[] = [];

// Lets go of the folders the stores were kept in.
export const cleanUp = () => made.splice(0).forEach((at) => rmSync(at, { recursive: true, force: true }));

// A store holding these holons, taken as one act.
export async function storeOf(holons: Holon[]): Promise<Store> {
  const folder = mkdtempSync(join(tmpdir(), "glass-fixture-"));
  made.push(folder);
  const store = strata(folderStorage(folder));

  const part = partOf(holons);
  const said = {
    when: "2026-11-19T00:00:00.000Z",
    at: [] as Act["at"],
    says: "a test",
    gone: [],
    parts: [[id(90), part && (await hashOf(part))]] as Act["parts"],
  };
  const reply = await store.offer({
    ...said,
    hash: await hashOf(contentOf(said)),
    own: id(90),
    holons,
    born: holons.map((holon) => holon.id),
    over: null,
    touches: { ids: holons.map((holon) => holon.id), addresses: [] },
  });
  if (!("accepted" in reply)) throw new Error(JSON.stringify(reply));
  return store;
}

// An engine on one thread over glass, the interface shipped into it.
export async function shipped(): Promise<{ engine: Engine; stores: Map<string, Store> }> {
  const stores = new Map([["glass", await storeOf(glass)]]);
  const started = await engine({ workers: sameThread(), count: 2 });
  await started.mount("glass", stores.get("glass")!, { write: true });
  await shipInterface(started, stores);
  return { engine: started, stores };
}
