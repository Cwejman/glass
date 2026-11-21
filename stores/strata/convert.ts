// Converts a store from glass's old format, blocks and a log in .glass/, into strata, act
// by act: each commit of the old log becomes one act, with its hash, its time and what it
// says, writing the versions that commit wrote and letting go of what it took out.
// References are marked $holds where they hold, as each holon's types say, the types read
// as they stand now in every store of this repository. It uses strata as any consumer
// does, offering one act after another, each made as an engine makes it: its part, its
// content hash, the store named by the id of its root; strata compacts them as it goes.
//
// An act of the old log that touched other stores too named only its own blocks, never
// the others' holons, so its converted act names only this store's part.
//
//   bun stores/strata/convert.ts <store name> <folder for the strata>

import { isRef, isRoot, mouldOf, references } from "../../engine/moulds.ts";
import {
  asHolon,
  goneIds,
  type Store as OldStore,
  type Version as OldVersion,
} from "../../integrations/glass/store.ts";
import { holonsOf, storesKept as storesHere } from "../../integrations/glass/found.ts";
import { contentOf, hashOf, partOf } from "../act.ts";
import type { Act, Head, Holon } from "../store.ts";
import { folderStorages } from "./storage/folder.ts";
import { strata } from "./strata.ts";

// Time spent apart: reading the old format and making each act from it, and strata taking
// the acts.
export type Spent = { acts: number; reading: number; offering: number };

export async function convert(name: string, into: string, converted: (spent: Spent) => void = () => {}) {
  const found = await storesHere();
  const old = found.get(name)?.store;
  if (!old) throw new Error(`no store here is called ${name}`);

  const types = await typesEverywhere([...found.values()].map(({ store }) => store));
  const root = (await holonsOf(old)).find((holon) => isRoot(holon, (id) => types.get(id)))!.id;
  const entries = await old.fullLog();
  const placed = entries.find(({ line }) => line.conversion)?.line.conversion?.blocks ?? [];
  const store = strata(folderStorages(into));
  let head: Head | null = null;
  const spent: Spent = { acts: 0, reading: 0, offering: 0 };

  for (const { line } of entries) {
    const reading = performance.now();

    // Each block of the old store read once for the act, however many of its holons the
    // act writes, and one at a time.
    const blocks = new Map<string, Map<string, OldVersion>>();
    const block = async (hash: string) =>
      blocks.get(hash) ?? blocks.set(hash, await blockOf(hash)).get(hash)!;

    const versions: OldVersion[] = [];
    if (line.held) for (const [id, place] of line.held) versions.push((await block(placed[place]!)).get(id)!);
    else for (const { hash } of ownBlocks(line)) versions.push(...(await block(hash)).values());

    const holons = versions.map((version) => marked(asHolon(version), types));
    const gone = goneIds(line.gone);
    const part = partOf(holons);
    const said = {
      when: line.at,
      says: line.says,
      at: [],
      gone,
      parts: [[root, part && (await hashOf(part))]] as Act["parts"],
    };
    const act: Act = {
      ...said,
      hash: await hashOf(contentOf(said)),
      own: root,
      holons,
      born: versions.filter((version) => version.prev === null).map((version) => version.id),
      over: head,
      touches: { ids: [...holons.map((holon) => holon.id), ...gone], addresses: [] },
    };

    const offering = performance.now();
    spent.reading += offering - reading;

    const reply = await store.offer(act);
    if (!("accepted" in reply))
      throw new Error(`the act ${act.hash} was not accepted: ${JSON.stringify(reply)}`);
    head = reply.accepted;

    spent.offering += performance.now() - offering;
    spent.acts++;
    converted(spent);
  }

  return { ...spent, head };

  // The versions in a block of the old store, each line one version.
  async function blockOf(hash: string) {
    const bytes = await old!.files.read(`blocks/${hash}.jsonl`);
    if (!bytes) throw new Error(`the block ${hash} is missing`);

    const text = new TextDecoder().decode(bytes);
    const versions = text
      .split("\n")
      .filter(Boolean)
      .map((each) => JSON.parse(each) as OldVersion);
    return new Map(versions.map((version) => [version.id, version]));
  }
}

// A holon's references, each holding one given $holds, as its types' mould says.
export function marked(holon: Holon, types: Map<string, Holon>): Holon {
  const mould = mouldOf(holon.instance.map((type) => types.get(type)));
  const holding = new Set(
    references(holon.body, mould)
      .filter(({ holds }) => holds)
      .map(({ key, id }) => `${key} ${id}`),
  );

  const mark = (value: unknown, key: string): unknown => {
    if (Array.isArray(value)) return value.map((each) => mark(each, key));
    if (!isRef(value)) return value;
    const { $holds: _, ...ref } = value as { $ref: string; $holds?: boolean };
    return holding.has(`${key} ${ref.$ref}`) ? { ...ref, $holds: true } : ref;
  };

  return {
    ...holon,
    body: Object.fromEntries(Object.entries(holon.body).map(([key, value]) => [key, mark(value, key)])),
  };
}

// Every type, a holon with a mould, as it stands now in any of the stores given.
export async function typesEverywhere(stores: Iterable<OldStore>) {
  const types = new Map<string, Holon>();

  for (const store of stores)
    for (const [id, { version }] of await store.all()) if (version.mould) types.set(id, asHolon(version));

  return types;
}

// The blocks of a line its store keeps: all of them, unless it says which are its own.
function ownBlocks({ blocks, own }: { blocks: { hash: string }[]; own?: string[] }) {
  return own ? blocks.filter(({ hash }) => own.includes(hash)) : blocks;
}

if (import.meta.main) {
  const [name, into] = process.argv.slice(2);
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const said = ({ acts, reading, offering }: Spent) =>
    `${acts} acts: reading the old format ${seconds(reading)}, strata ${seconds(offering)}`;

  const spent = await convert(name!, into!, (spent) => {
    if (spent.acts % 25 === 0) console.log(said(spent));
  });
  console.log(said(spent), "— done");
}
