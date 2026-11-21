// The cut held to the old field. At head the cut stores together hold what the old
// stores held, holon for holon, each where the plan places it, but for what the plan
// strips. The holons the cut works out are held to their old ones apart: every root holds
// only its own store's wholes, and together the roots hold the old roots' wholes and the
// wholes of types hold the old types. Each store is then read alone through the new
// engine, its whole from its root, and gives what strata keeps.
//
//   bun stores/strata/parity.ts <folder the cut is in>

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { engine } from "../../engine/next/engine.ts";
import { isRef } from "../../engine/moulds.ts";
import { canonical } from "../../integrations/glass/canonical.ts";
import { asHolon, type Store as OldStore } from "../../integrations/glass/store.ts";
import { sameThread } from "../../runtime/runtime.ts";
import type { Holon, Store } from "../store.ts";
import { marked, typesEverywhere } from "./convert.ts";
import { cleaner, glassCut, oldStores, placement, placing, type Plan } from "./cut.ts";
import { commitAt, headAt, stateNow } from "./head.ts";
import { folderStorage } from "./storage/folder.ts";
import { strata } from "./strata.ts";

// What differs, each said in a line, and how many holons each store holds.
export type Held = { differs: string[]; holons: Record<string, number>; acts: Record<string, number> };

export async function parity(old: ReadonlyMap<string, OldStore>, plan: Plan, into: string): Promise<Held> {
  const types = await typesEverywhere(old.values());
  const roots = new Set(plan.stores.map(({ root }) => root.from));
  const found = await placing(old, roots, types);
  const { stripped, storeOf } = placement(plan, found);
  const cleaned = cleaner(plan, stripped);
  const differs: string[] = [];
  const refs = (value: unknown) =>
    (Array.isArray(value) ? value : value === undefined ? [] : [value]).filter(isRef);

  const field = new Map<string, Holon>();
  for (const store of old.values())
    for (const [id, { version }] of await store.all()) field.set(id, marked(asHolon(version), types));

  // Each cut store at head: its root, the id its commits are owned by, and every holon
  // its root holds, all the way down.
  const cut = new Map<string, { root: string; store: Store; holons: Map<string, Holon> }>();
  for (const { name } of plan.stores) {
    const storage = folderStorage(join(into, name));
    const store = strata(storage);
    const now = (await stateNow(storage))!;
    const root = (await commitAt(storage, now.commit)).own;
    const lines = await store.read(await headAt(storage, now.commit), { whole: { id: root } });
    const holons = new Map(
      new TextDecoder()
        .decode(lines)
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Holon)
        .map((holon) => [holon.id, holon]),
    );
    cut.set(name, { root, store, holons });
  }

  // The holons the cut worked out: the roots, their wholes of types, and their
  // dependencies, each kept or minted.
  const worked = new Map<string, string>();
  for (const [name, { root, holons }] of cut) {
    worked.set(root, name);
    const target = plan.stores.find((each) => each.name === name)!;
    const minted = (id: string) => !found.first.has(id);
    for (const { $ref } of refs(holons.get(root)?.body.contents))
      if ($ref === target.types || minted($ref)) worked.set($ref, name);
    for (const { $ref } of refs(holons.get(root)?.body.dependencies))
      if (minted($ref)) worked.set($ref, name);
  }
  const sources = new Set([...roots, ...plan.pooled, ...plan.stores.flatMap(({ types }) => types ?? [])]);

  // Holon for holon: each old one in the store the plan places it, as it was but for what
  // is stripped; none stripped kept; none kept twice, nor any the old field has not.
  const union = new Map<string, string>();
  for (const [name, { holons }] of cut)
    for (const id of holons.keys()) {
      if (union.has(id)) differs.push(`${id} is kept by ${union.get(id)} and ${name}`);
      union.set(id, name);
    }

  for (const [id, holon] of field) {
    if (stripped.has(id)) {
      if (union.has(id)) differs.push(`${id} is stripped, but ${union.get(id)} keeps it`);
      continue;
    }
    if (sources.has(id)) continue;
    const store = storeOf(id);
    const kept = cut.get(store)?.holons.get(id);
    if (!kept) differs.push(`${id} is not in ${store}${union.has(id) ? `, but in ${union.get(id)}` : ""}`);
    else if (canonical(kept) !== canonical(cleaned(holon)))
      differs.push(`${id} in ${store} is not as it was`);
  }
  for (const [id, name] of union)
    if (!field.has(id) && !worked.has(id)) differs.push(`${name} keeps ${id}, which the old field does not`);

  // The worked-out holons: each root holds its own wholes only; together the roots hold
  // the old roots' wholes, and the wholes of types the old types, but what is stripped.
  const wholes = (ids: string[], key: string) =>
    new Set(ids.flatMap((id) => refs(field.get(id)?.body[key]).map(({ $ref }) => $ref)));
  const typesWholes = new Set(plan.stores.flatMap(({ types }) => types ?? []));
  const wanted = {
    contents: [...wholes([...roots], "contents")].filter(
      (id) => !stripped.has(id) && !plan.pooled.includes(id) && !typesWholes.has(id),
    ),
    holds: [...wholes([...plan.pooled, ...typesWholes], "holds")].filter((id) => !stripped.has(id)),
  };
  const got = { contents: new Set<string>(), holds: new Set<string>() };

  for (const [name, { root, holons }] of cut) {
    const stands = refs(holons.get(root)?.body.dependencies).map(({ $ref }) => holons.get($ref)?.name);
    const standsOn = plan.stores.find((each) => each.name === name)!.stands.map(({ name }) => name);
    if (canonical(stands) !== canonical(standsOn))
      differs.push(
        `${name} stands on ${stands.join(", ") || "nothing"}, not ${standsOn.join(", ") || "nothing"}`,
      );

    for (const { $ref } of refs(holons.get(root)?.body.contents)) {
      if (!holons.has($ref)) differs.push(`the root of ${name} holds ${$ref}, which ${name} does not keep`);
      if (worked.get($ref) === name || $ref === plan.stores.find((each) => each.name === name)!.types)
        for (const type of refs(holons.get($ref)?.body.holds)) got.holds.add(type.$ref);
      else got.contents.add($ref);
    }
  }
  for (const key of ["contents", "holds"] as const) {
    for (const id of wanted[key]) if (!got[key].has(id)) differs.push(`no cut store's ${key} holds ${id}`);
    for (const id of got[key])
      if (!wanted[key].includes(id)) differs.push(`a cut store's ${key} holds ${id}, which no old one held`);
  }

  // Each store alone through the new engine: its whole, read from its root, and its log.
  const acts: Record<string, number> = {};
  for (const [name, { root, store, holons }] of cut) {
    const alone = await engine({ workers: sameThread(), count: 1 });
    await alone.mount(name, store);
    const answer = await alone.read(wholeAndLog(root, name));
    await alone.unmount(name);
    if (!("value" in answer)) {
      differs.push(`${name} alone does not read: ${answer.problem}`);
      continue;
    }

    const [whole, log] = answer.value as [{ holons: Record<string, Holon> }, unknown[]];
    acts[name] = log.length;
    const read = Object.entries(whole.holons);
    if (read.length !== holons.size)
      differs.push(`${name} alone reads ${read.length} holons of ${holons.size}`);
    for (const [id, { id: _, instance, name: called, mould, body }] of read) {
      const kept = holons.get(id);
      const as = {
        id,
        instance,
        ...(called !== undefined && { name: called }),
        ...(mould && { mould }),
        body,
      };
      if (!kept || canonical(as) !== canonical(kept)) differs.push(`${name} alone reads ${id} otherwise`);
    }
  }

  return {
    differs,
    holons: Object.fromEntries([...cut].map(([name, { holons }]) => [name, holons.size])),
    acts,
  };
}

// A read of a store's whole from its root and its log, carrying the two natives it uses,
// so it needs no other store.
function wholeAndLog(root: string, store: string) {
  const native = (id: string, name: string) => ({ id, instance: ["~1"], name, body: { native: name } });
  const use = (id: string, fn: string, args: unknown[]) => ({
    id,
    instance: ["~2"],
    body: { fn: { $ref: fn }, args },
  });

  return {
    gives: [
      { $ref: "~5", $holds: true },
      { $ref: "~6", $holds: true },
    ],
    holons: [
      {
        id: "~1",
        instance: [],
        name: "function",
        mould: {
          native: { says: "its native", shape: "string", optional: true },
          input: { says: "its placeholders", shape: { list: "ref" }, holds: true, optional: true },
        },
        body: {},
      },
      {
        id: "~2",
        instance: [],
        name: "use",
        mould: {
          fn: { says: "the function it applies", shape: "ref", optional: true },
          args: { says: "what it gives the function", shape: "json" },
        },
        body: {},
      },
      native("~3", "whole"),
      native("~4", "log"),
      use("~5", "~3", [{ $ref: root }]),
      use("~6", "~4", [store]),
    ] as Holon[],
  };
}

// The bytes of every file beneath a folder.
export const sizeOf = (folder: string): number =>
  readdirSync(folder, { withFileTypes: true }).reduce(
    (sum, entry) =>
      sum +
      (entry.isDirectory() ? sizeOf(join(folder, entry.name)) : statSync(join(folder, entry.name)).size),
    0,
  );

if (import.meta.main) {
  const [into] = process.argv.slice(2);
  const from = performance.now();
  const { differs, holons, acts } = await parity(await oldStores(), glassCut, into!);

  for (const line of differs.slice(0, 50)) console.log(line);
  for (const [name, count] of Object.entries(holons))
    console.log(
      `${name}: ${count} holons, ${acts[name]} acts, ${(sizeOf(join(into!, name)) / 1e6).toFixed(1)} MB`,
    );
  console.log(`${differs.length} differ, in ${Math.round(performance.now() - from)} ms`);
  process.exit(differs.length ? 1 : 0);
}
