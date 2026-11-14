// Converts a store from glass's old format, blocks and a log in .glass/, into strata, act
// by act: each commit of the old log becomes one act, with its hash, its time and what it
// says, writing the versions that commit wrote and letting go of what it took out.
// References are marked $holds where they hold, as each holon's types say, the types read
// as they stand now in every store of this repository. It uses strata as any consumer
// does, offering one act after another; strata compacts them as it goes.
//
//   bun stores/strata/convert.ts <store name> <folder for the strata>

import { isRef, mouldOf, references } from "../../engine/moulds.ts";
import { actHash, asHolon, goneIds, type Version as OldVersion } from "../../integrations/glass/store.ts";
import { storesHere } from "../../stores.ts";
import type { Act, Head, Holon } from "../store.ts";
import { folderStorage } from "./storage/folder.ts";
import { strata } from "./strata.ts";

export async function convert(name: string, into: string, converted: (acts: number) => void = () => {}) {
  const found = await storesHere();
  const old = found.get(name)?.store;
  if (!old) throw new Error(`no store here is called ${name}`);

  const types = await typesEverywhere(found);
  const entries = await old.fullLog();
  const placed = entries.find(({ line }) => line.conversion)?.line.conversion?.blocks ?? [];
  const store = strata(folderStorage(into));
  let head: Head | null = null;
  let done = 0;

  for (const { line } of entries) {
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
    const act: Act = {
      hash: await actHash(line),
      at: line.at,
      says: line.says,
      over: head,
      holons,
      gone,
      touches: { ids: [...holons.map((holon) => holon.id), ...gone], addresses: [] },
      alongside: line.stores ?? [],
    };

    const reply = await store.offer(act);
    if (!("accepted" in reply))
      throw new Error(`the act ${act.hash} was not accepted: ${JSON.stringify(reply)}`);
    head = reply.accepted;
    converted(++done);
  }

  return { acts: entries.length, head };

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
function marked(holon: Holon, types: Map<string, Holon>): Holon {
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

// Every type, a holon with a mould, as it stands now in any store found.
async function typesEverywhere(found: Awaited<ReturnType<typeof storesHere>>) {
  const types = new Map<string, Holon>();

  for (const { store } of found.values())
    for (const [id, { version }] of await store.all()) if (version.mould) types.set(id, asHolon(version));

  return types;
}

// The blocks of a line its store keeps: all of them, unless it says which are its own.
function ownBlocks({ blocks, own }: { blocks: { hash: string }[]; own?: string[] }) {
  return own ? blocks.filter(({ hash }) => own.includes(hash)) : blocks;
}

if (import.meta.main) {
  const [name, into] = process.argv.slice(2);
  const started = performance.now();
  const { acts, head } = await convert(name!, into!, (done) => {
    if (done % 25 === 0) console.log(`${done} acts, ${((performance.now() - started) / 1000).toFixed(1)} s`);
  });
  console.log({ acts, head, seconds: ((performance.now() - started) / 1000).toFixed(1) });
}
