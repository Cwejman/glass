// For tests: the least of glass the interface ships over, in one store mounted as glass,
// with two notes, the first referring to the second, and a text to read; a brief of prose
// with a brief in its flow and a section; a component of the earlier form, realized
// nowhere, and a use of it; a use naming no component, given the brief; and an engine
// over it, the interface shipped (interface.ts).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sameThread } from "../../runtime/runtime.ts";
import { contentOf, hashOf, partOf } from "../../stores/act.ts";
import type { Act, Holon, Store } from "../../stores/store.ts";
import { folderStorages } from "../../stores/strata/storage/folder.ts";
import { strata } from "../../stores/strata/strata.ts";
import { engine, type Engine } from "../engine.ts";
import { shipInterface } from "./interface.ts";

export const id = (n: number) => String(n).padStart(15, "0");

// The types a store's root and shape are of, and glass's own shape, by the ids glass
// keeps them under, so a store shipped in the repository, standing on glass, stands on
// this glass too, as the location's does (integrations/location/location.ts).
export const glassIds = { store: "1M75HB35AC75002", shape: "1M75HB35AC75000", own: "1M75HB35AC75003" };

const declared = { says: "Any JSON.", shape: "json", optional: true };
const held = (n: number) => ({ $ref: id(n), $holds: true });
const kinds = ["value", "number", "string", "list", "record", "holon"];
const natives = ["get", "parse", "print", "add", "map", "size", "keys", "in", "find"];

export const notes = {
  first: id(80),
  second: id(81),
  query: id(82),
  brief: id(100),
  inner: id(104),
  part: id(105),
  session: id(31),
  sessionUse: id(32),
  unnamed: id(33),
};

const proseType = (n: number, name: string) => ({
  id: id(n),
  instance: [],
  name,
  mould: { ...prose },
  body: {},
});
const prose = { prose: declared, parts: declared, text: declared };
const thing = (n: number, type: number, body: Holon["body"], name?: string): Holon => ({
  id: id(n),
  instance: [id(type)],
  ...(name !== undefined && { name }),
  body,
});

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
    mould: { says: declared, input: declared, takes: declared, kinds: declared, code: declared },
    body: {},
  },
  {
    id: glassIds.store,
    instance: [],
    name: "store",
    mould: {
      shape: { says: "Its shape.", shape: "ref" },
      contents: { says: "What it holds.", shape: { set: "ref" }, holds: true },
    },
    body: {},
  },
  {
    id: glassIds.shape,
    instance: [],
    name: "shape",
    mould: { admits: { says: "What it admits.", shape: { set: "ref" }, optional: true } },
    body: {},
  },
  proseType(6, "brief"),
  proseType(7, "paragraph"),
  proseType(8, "sentence"),
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
  ...["follow", "concat", "filter", "take", "reverse", "takes", "eq", "has", "and", "kind"].map(
    (name, i) => ({
      id: id(46 + i),
      instance: [id(1)],
      name,
      body: { native: name },
    }),
  ),
  { id: id(30), instance: [id(3)], name: "Value", body: { says: "Any value, as what it is." } },
  thing(
    31,
    3,
    { says: "A session, in full.", takes: ["session"], kinds: ["full"], code: "export default 1" },
    "Session",
  ),
  thing(32, 2, { fn: { $ref: id(31) }, args: ["said"] }),
  thing(33, 2, { args: [{ $ref: id(100) }] }),
  // glass's types, in the wholes glass groups them in.
  { id: id(40), instance: [], name: "language", body: { holds: [1, 2, 10, 11, 12, 13, 14, 15].map(held) } },
  {
    id: id(43),
    instance: [],
    name: "store",
    body: { holds: [glassIds.store, glassIds.shape].map(($ref) => ({ $ref, $holds: true })) },
  },
  { id: id(44), instance: [], name: "prose", body: { holds: [6, 7, 8].map(held) } },
  { id: id(45), instance: [], name: "interface", body: { holds: [held(3)] } },
  {
    id: id(41),
    instance: [],
    name: "functions",
    body: {
      holds: [
        ...natives.map((_, i) => held(20 + i)),
        held(46),
        held(47),
        held(48),
        held(49),
        held(50),
        held(51),
        held(52),
        held(53),
        held(54),
        held(55),
      ],
    },
  },
  { id: id(42), instance: [], name: "components", body: { holds: [held(30), held(31)] } },
  {
    id: notes.first,
    instance: [],
    name: "First",
    body: { text: "Glass holds holons", see: { $ref: notes.second } },
  },
  { id: notes.second, instance: [], name: "Second", body: {} },
  { id: notes.query, instance: [], name: "query", body: { text: "1 | add(2) | add(3)" } },
  thing(100, 6, { prose: [held(101), held(104)], parts: [held(105)] }, "Notes"),
  thing(101, 7, { text: ["Notes hold."] }),
  thing(104, 6, { prose: [], parts: [] }, "Inner"),
  thing(105, 6, { prose: [held(107)], parts: [] }, "Part"),
  thing(107, 7, { text: ["Within"] }),
  {
    id: id(90),
    instance: [glassIds.store],
    name: "glass",
    body: {
      shape: { $ref: glassIds.own },
      contents: [40, 43, 44, 45, 41, 42, 80, 81, 82, 32, 33, 100].map(held),
    },
  },
  { id: glassIds.own, instance: [glassIds.shape], name: "glass's own", body: {} },
];

const made: string[] = [];

// Lets go of the folders the stores were kept in.
export const cleanUp = () => made.splice(0).forEach((at) => rmSync(at, { recursive: true, force: true }));

// A store holding these holons, taken as one act.
export async function storeOf(holons: Holon[]): Promise<Store> {
  const folder = mkdtempSync(join(tmpdir(), "glass-fixture-"));
  made.push(folder);
  const store = strata(folderStorages(folder));

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
