// Cuts the stores of glass's old format, blocks and a log in .glass/, into other stores in
// strata, history whole. The old logs are replayed together in the order of their time,
// and each old commit becomes one act, the same in every store it gives a share: one
// content hash, its parts naming each store's share by hash, each store offered its own.
//
// Where each holon goes is a plan. A holon goes with the whole it stands in, a whole an
// old root held, or one that stood alone before roots: the replay keeps track of which
// whole holds each id, so a holon let go long ago is placed too. A type of an old whole of
// types goes with its instances: to the one store they are in, or to the common store
// where they are in several or none.
//
// A few holons are worked out rather than carried: each store's root, holding its share
// of its old root's contents and standing on what the plan says; each store's whole of
// types, its share of the old ones; and the dependencies minted for a root. They are
// worked out again after every act, and written where they changed. What the plan strips
// is cut out of history as though never written: its holons, the instances of a type it
// strips, every reference to them, and the keys it names. An act left with nothing to
// write is dropped; one that wrote nothing in the old log is kept, in its old store's home.
//
// References are marked $holds as convert.ts marks them. The cut is deterministic: an id
// it mints is minted at the moment of the act that first needs it, from a count no old id
// has, so the cut run again makes the same acts and the same history.
//
//   bun stores/strata/cut.ts <folder for the strata>

import { join } from "node:path";
import { isRef, partsOf } from "../../engine/moulds.ts";
import { canonical } from "../../integrations/glass/canonical.ts";
import {
  actHash,
  asHolon,
  goneIds,
  idAt,
  nextId,
  type Store as OldStore,
  type Version,
} from "../../integrations/glass/store.ts";
import { storesHere } from "../../stores.ts";
import { contentOf, hashOf, partOf } from "../act.ts";
import type { Act, Head, Holon } from "../store.ts";
import { marked, typesEverywhere } from "./convert.ts";
import { folderStorages } from "./storage/folder.ts";
import { strata } from "./strata.ts";

// A store cut into: its name; its root, the old root it takes its share of and the id it
// keeps, or none, to mint one; its whole of types, kept by id, or none, to mint one when
// it first has a type; and what it stands on, each a dependency kept by id or minted.
export type Target = {
  name: string;
  root: { from: string; id?: string };
  types?: string;
  stands: { name: string; id?: string }[];
};

// Where everything goes. wholes places each whole by id, a store's name or null to strip
// it; homes, by old store, places what no whole does, and keeps an act that wrote
// nothing. pooled are the old wholes of types placed by their instances; typed places a
// type outright, null to strip it and its instances; common takes a type of several
// stores. keys are stripped from a type's mould and from its instances' bodies.
// dependency is the type of a dependency.
export type Plan = {
  stores: Target[];
  wholes: Record<string, string | null>;
  homes: Record<string, string>;
  pooled: string[];
  typed: Record<string, string | null>;
  common: string;
  keys: Record<string, string[]>;
  dependency: string;
};

// The cut of this repository's stores: glass, the wiki keeping main's root id, the author
// on a root of its own, paper and paper-readings as they were. The site is not cut. The
// lexicon, both copies and every lexeme, is stripped, and with it each word's lexeme. The
// measures each measure a session, and the statistics and their board the author's
// sessions and words, so they go with the author; the markdown forms, of the wiki's
// pages, with the wiki, which is also main's home: what stood alone there, paragraphs of
// the wiki let go long ago, goes there.
export const glassCut: Plan = {
  stores: [
    {
      name: "glass",
      root: { from: "1M75HB35AC75004", id: "1M75HB35AC75004" },
      types: "1M6ZXAZFQ20K001",
      stands: [],
    },
    {
      name: "wiki",
      root: { from: "1M75HK6NRRDX001", id: "1M75HK6NRRDX001" },
      types: "1M6ZXAZDW3QP000",
      stands: [{ name: "glass", id: "1M75HK6NRRDX000" }, { name: "author" }],
    },
    { name: "author", root: { from: "1M75HK6NRRDX001" }, stands: [{ name: "glass" }, { name: "wiki" }] },
    {
      name: "paper",
      root: { from: "1M75HK6NRRDX003", id: "1M75HK6NRRDX003" },
      stands: [{ name: "glass", id: "1M75HZJPNFPK001" }],
    },
    {
      name: "paper-readings",
      root: { from: "1M75HK6NRRDX006", id: "1M75HK6NRRDX006" },
      stands: [
        { name: "glass", id: "1M75HZJPNFPK000" },
        { name: "paper", id: "1M75HK6NRRDX005" },
      ],
    },
  ],
  wholes: {
    "1M6YBY3G000001J": null, // lexicon
    "1M6YBY3G000001K": "author", // The author
    "1M6YBY3G000001M": "author", // As it was said
    "1M6YBY3G00010TW": "wiki", // The wiki
    "1M6YBY3G0001WT4": "wiki", // wiki-markdown
    "1M6YBY3G0001XAQ": "wiki", // raised
    "1M6YBY3G0001XBR": "author", // measured
    "1M6YBY3G0001XE2": "author", // Statistics and functions
    "1M6YBY3G0001XEH": "author", // Sessions
    "1M78WP0TEMPG4YR": "wiki", // Knowledge
    "1M75HK6NRRDX000": "wiki", // main's dependency on glass
    "1M6YBY3G1000BKE": null, // paper's lexicon
    "1M75HK6NRRDX002": null, // paper's dependency on main
    "1M75HK6NRRDX004": null, // paper-readings' dependency on main
  },
  homes: { main: "wiki", glass: "glass", paper: "paper", "paper-readings": "paper-readings" },
  pooled: ["1M6ZXAZDW3QP000"],
  typed: {
    ...Object.fromEntries(
      // The prose: paragraph, break, sentence, word, drawing, brief, list, item, quote,
      // code, table, closed, link, emphasis, strong and codespan.
      ["2", "3", "4", "5", "8", "X", "Y", "Z", "10", "11", "12", "13", "14", "15", "16", "17"].map((n) => [
        `1M6YBY3G${n.padStart(7, "0")}`,
        "glass",
      ]),
    ),
    "1M6YBY3G0000006": null, // lexeme
    "1M6YBY3G0000009": null, // lexicon
    "1M6YBY3G000000G": null, // paper's lexeme
    "1M6YBY3G000000H": null, // paper's lexicon
  },
  common: "glass",
  keys: { "1M6YBY3G0000005": ["lexeme"], "1M6YBY3G000000F": ["lexeme"] },
  dependency: "1M75HB35AC75001",
};

// An old commit as the replay reads it: its moment, what it says, the versions it wrote,
// each with the old store that kept it, the ids it took out, and the stores whose logs
// hold it.
type OldAct = {
  when: string;
  says: string;
  versions: { holon: Holon; from: string }[];
  gone: string[];
  from: string[];
};

type Line = Awaited<ReturnType<OldStore["fullLog"]>>[number]["line"];

// Every old store's commits, as one history: the logs merged, each kept in its own order,
// the earliest commit at the head of any log next. A commit several logs hold is one, taken
// when it heads all of them. References are marked as the types given say.
export async function* replay(
  old: ReadonlyMap<string, OldStore>,
  types: Map<string, Holon>,
): AsyncGenerator<OldAct> {
  const logs = await Promise.all(
    [...old].map(async ([name, store]) => {
      const entries = await store.fullLog();
      const placed = entries.find(({ line }) => line.conversion)?.line.conversion?.blocks ?? [];
      const lines = await Promise.all(entries.map(async ({ line }) => ({ line, act: await actHash(line) })));
      return { name, store, placed, lines, next: 0 };
    }),
  );
  const holding = new Map<string, typeof logs>();
  for (const log of logs)
    for (const { act } of log.lines) holding.set(act, [...(holding.get(act) ?? []), log]);

  const headOf = (log: (typeof logs)[number]) => log.lines[log.next];

  for (;;) {
    const ready = logs.filter((log) => {
      const head = headOf(log);
      return head && holding.get(head.act)!.every((other) => headOf(other)?.act === head.act);
    });
    if (!ready.length) {
      if (logs.some(headOf)) throw new Error("the old logs hold a commit in two orders");
      return;
    }

    const earliest = ready.reduce((first, log) =>
      headOf(log)!.line.at < headOf(first)!.line.at ? log : first,
    );
    const head = headOf(earliest)!;
    const versions = new Map<string, { holon: Holon; from: string }>();

    for (const log of holding.get(head.act)!) {
      for (const version of await versionsOf(log.store, log.placed, log.lines[log.next]!.line))
        versions.set(version.id, { holon: marked(asHolon(version), types), from: log.name });
      log.next++;
    }

    yield {
      when: head.line.at,
      says: head.line.says,
      versions: [...versions.values()],
      gone: goneIds(head.line.gone),
      from: holding.get(head.act)!.map(({ name }) => name),
    };
  }
}

// The versions an old line wrote: those it held anew, before the conversion, or those of
// its own blocks. Each block is read once for the line.
async function versionsOf(store: OldStore, placed: string[], line: Line): Promise<Version[]> {
  const blocks = new Map<string, Promise<Map<string, Version>>>();
  const block = (hash: string) => blocks.get(hash) ?? blocks.set(hash, blockOf(store, hash)).get(hash)!;

  if (line.held)
    return Promise.all(line.held.map(async ([id, place]) => (await block(placed[place]!)).get(id)!));

  const own = line.own ? line.blocks.filter(({ hash }) => line.own!.includes(hash)) : line.blocks;
  return (await Promise.all(own.map(async ({ hash }) => [...(await block(hash)).values()]))).flat();
}

async function blockOf(store: OldStore, hash: string) {
  const bytes = await store.files.read(`blocks/${hash}.jsonl`);
  if (!bytes) throw new Error(`the block ${hash} is missing`);

  const versions = new TextDecoder()
    .decode(bytes)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Version);
  return new Map(versions.map((version) => [version.id, version]));
}

// What the replay found of every id: the whole it last stood in, the wholes that stood
// under a root, what each id last held, the old store that first kept it, and, for each
// type, the ids that were ever its instances; and each id that moved from one whole to
// another, with both.
export type Found = {
  wholes: Map<string, string>;
  tops: Set<string>;
  held: Map<string, string[]>;
  first: Map<string, string>;
  instances: Map<string, Set<string>>;
  moved: { id: string; was: string; is: string }[];
};

// Replays the old stores once, keeping track of which holon holds each id. After each
// commit every holon it wrote is placed in the whole it now stands in: the holon its
// holders lead up to, below a root or standing alone. Placing a holon places everything
// it holds that stood elsewhere, so a whole moving takes its parts along.
export async function placing(
  old: ReadonlyMap<string, OldStore>,
  roots: ReadonlySet<string>,
  types: Map<string, Holon>,
): Promise<Found> {
  const holders = new Map<string, Set<string>>();
  const parts = new Map<string, string[]>();
  const found: Found = {
    wholes: new Map(),
    tops: new Set(),
    held: new Map(),
    first: new Map(),
    instances: new Map(),
    moved: [],
  };

  const letGo = (id: string) => {
    for (const part of parts.get(id) ?? []) holders.get(part)?.delete(id);
    parts.delete(id);
  };

  for await (const { versions, gone } of replay(old, types)) {
    for (const { holon, from } of versions) {
      if (!found.first.has(holon.id)) found.first.set(holon.id, from);
      for (const type of holon.instance)
        (found.instances.get(type) ?? found.instances.set(type, new Set()).get(type)!).add(holon.id);

      letGo(holon.id);
      parts.set(holon.id, partsOf(holon.body));
      found.held.set(holon.id, parts.get(holon.id)!);
      for (const part of parts.get(holon.id)!)
        (holders.get(part) ?? holders.set(part, new Set()).get(part)!).add(holon.id);
    }
    for (const id of gone) {
      letGo(id);
      holders.delete(id);
    }

    // A holon's holder within its own old store, the latest to hold it: a holon held from
    // another store, as a reading holds the paper's sections, stays in its own.
    const holderOf = (id: string) =>
      [...(holders.get(id) ?? [])].findLast((held) => found.first.get(held) === found.first.get(id));

    const placed = new Set<string>();
    const place = (id: string) => {
      let whole = id;
      for (const seen = new Set([id]); holderOf(whole) && !roots.has(holderOf(whole)!); ) {
        whole = holderOf(whole)!;
        if (seen.has(whole)) break;
        seen.add(whole);
      }
      if (roots.has(holderOf(whole) ?? "")) found.tops.add(whole);

      for (const stack = [id]; stack.length; ) {
        const at = stack.pop()!;
        if (roots.has(at) || placed.has(at) || found.first.get(at) !== found.first.get(id)) continue;
        const was = found.wholes.get(at);
        if (was === whole && at !== id) continue;
        if (was !== undefined && was !== whole) found.moved.push({ id: at, was, is: whole });
        found.wholes.set(at, whole);
        placed.add(at);
        stack.push(...(parts.get(at) ?? []));
      }
    };

    for (const { holon } of versions)
      if (roots.has(holon.id)) parts.get(holon.id)?.forEach(place);
      else place(holon.id);
  }

  return found;
}

// The plan applied to what the replay found: which ids are stripped, and the store each
// other id goes to. An id goes with its whole: where the plan places the whole, or else
// in the home of its old store. A whole that never stood under a root stood alone, and
// goes with what it holds. A type goes with its instances, where it stood in a pooled
// whole or alone, unless the plan places it; to the common store where they are in
// several stores or none.
export function placement(plan: Plan, found: Found) {
  // The whole an id last stood in, and the whole that one last stood in, until one stood
  // under a root or alone: a part let go while its whole stood alone goes where its whole
  // went after.
  const wholeOf = (id: string) => {
    let whole = id;
    for (const seen = new Set<string>(); found.wholes.has(whole) && !seen.has(whole); seen.add(whole))
      whole = found.wholes.get(whole)!;
    return whole;
  };

  const stripped = new Set<string>();
  for (const [type, store] of Object.entries(plan.typed))
    if (store === null) for (const id of [type, ...(found.instances.get(type) ?? [])]) stripped.add(id);
  for (const id of new Set([...found.wholes.keys(), ...Object.keys(plan.wholes)]))
    if (plan.wholes[wholeOf(id)] === null) stripped.add(id);

  // The one store the ids given are in, or the fallback.
  const among = (ids: Iterable<string>, fallback: string) => {
    const stores = new Set([...ids].filter((id) => !stripped.has(id)).map(storeOf));
    return stores.size === 1 ? [...stores][0]! : fallback;
  };

  const placed = new Map<string, string>();
  function storeOf(id: string): string {
    const whole = wholeOf(id);
    const home = plan.homes[found.first.get(id)!]!;
    if (id in plan.typed) return plan.typed[id]!;
    if (whole in plan.wholes) return plan.wholes[whole]!;

    const pooled = plan.pooled.includes(whole) && id !== whole;
    const alone = !found.tops.has(whole);
    if (pooled || (alone && found.instances.has(id)))
      return among(found.instances.get(id) ?? [], plan.common);
    if (!alone) return home;
    if (placed.has(whole)) return placed.get(whole)!;

    placed.set(whole, home);
    const held = (found.held.get(whole) ?? []).filter((part) => wholeOf(part) !== whole);
    placed.set(whole, among(held, home));
    return placed.get(whole)!;
  }

  return { stripped, storeOf };
}

// A holon with what the plan strips taken out: references to stripped holons, and the
// keys named for its types in its body, and for itself in its mould.
export function cleaner(plan: Plan, stripped: ReadonlySet<string>) {
  const without = (value: unknown): unknown => {
    if (isRef(value)) return stripped.has(value.$ref) ? undefined : value;
    if (Array.isArray(value)) return value.map(without).filter((each) => each !== undefined);
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, inner]) => [key, without(inner)] as const)
        .filter(([, inner]) => inner !== undefined),
    );
  };

  return (holon: Holon): Holon => {
    const keys = new Set(holon.instance.flatMap((type) => plan.keys[type] ?? []));
    const body = without(Object.fromEntries(Object.entries(holon.body).filter(([key]) => !keys.has(key))));
    const mould = plan.keys[holon.id] && holon.mould;
    return {
      ...holon,
      body: body as Holon["body"],
      ...(mould && {
        mould: Object.fromEntries(
          Object.entries(mould).filter(([key]) => !plan.keys[holon.id]!.includes(key)),
        ),
      }),
    };
  };
}

// Time spent apart: placing, reading the old format again and making each act, and strata
// taking the acts; and the acts made and dropped.
export type Spent = { placing: number; reading: number; offering: number; acts: number; dropped: number };

// What one act gives one store: the holons it writes there, and the ids it lets go there.
type Share = { holons: Map<string, Holon>; gone: Set<string> };

// Cuts the old stores into the plan's stores, each a strata in a folder of its name.
export async function cut(
  old: ReadonlyMap<string, OldStore>,
  plan: Plan,
  into: string,
  told: (spent: Spent) => void = () => {},
) {
  const spent: Spent = { placing: 0, reading: 0, offering: 0, acts: 0, dropped: 0 };
  const types = await typesEverywhere(old.values());
  const roots = new Set(plan.stores.map(({ root }) => root.from));

  const placingFrom = performance.now();
  const found = await placing(old, roots, types);
  const { stripped, storeOf: placed } = placement(plan, found);
  spent.placing = performance.now() - placingFrom;

  // The ids worked out rather than carried, by the store each is in, and the old holons
  // they are worked out from, as they stand.
  const made = new Map<string, string>();
  for (const { name, root, types } of plan.stores) {
    if (root.id) made.set(root.id, name);
    if (types) made.set(types, name);
  }
  const storeOf = (id: string) => made.get(id) ?? placed(id);
  const sources = new Set([...roots, ...plan.pooled, ...made.keys()]);
  const current = new Map<string, Holon>();

  // Ids minted, each for one purpose, at the moment of the act that first needs it.
  const minted = new Map<string, string>();
  const taken = new Set(found.first.keys());
  const mint = (purpose: string, when: string, store: string) => {
    if (minted.has(purpose)) return minted.get(purpose)!;
    let id = idAt(Date.parse(when), 1_000_000_000);
    while (taken.has(id)) id = nextId(id);
    taken.add(id);
    minted.set(purpose, id);
    made.set(id, store);
    return id;
  };

  const cleaned = cleaner(plan, stripped);

  const refs = (value: unknown) =>
    (Array.isArray(value) ? value : value === undefined ? [] : [value]).filter(isRef);
  const rootId = (target: Target, when: string) =>
    target.root.id ?? mint(`the root of ${target.name}`, when, target.name);

  // What each worked-out holon was last written as, by id, so it is written again only
  // where it changed.
  const written = new Map<string, string>();

  // A store's whole of types: its own old whole's types, and those of the pooled wholes
  // placed in it; none until it has one.
  const typesOf = (target: Target, when: string): Holon | null => {
    const pools = plan.pooled.flatMap((id) => current.get(id) ?? []);
    const own = target.types && !plan.pooled.includes(target.types) ? current.get(target.types) : undefined;
    const pooled = pools.flatMap(({ body }) =>
      refs(body.holds).filter(({ $ref }) => storeOf($ref) === target.name),
    );
    const id = target.types ?? minted.get(`the types of ${target.name}`);
    if (!own && !pooled.length && !(id && written.has(id))) return null;

    const like = own ?? pools[0];
    if (!like) return null;
    return {
      ...like,
      id: id ?? mint(`the types of ${target.name}`, when, target.name),
      body: { ...like.body, holds: [...refs(own?.body.holds), ...pooled] },
    };
  };

  // A store's root: its old root's contents placed in it, its whole of types, and what it
  // stands on; none until its old root is.
  const rootOf = (target: Target, when: string, typesId: string | undefined): Holon | null => {
    const source = current.get(target.root.from);
    if (!source) return null;

    const contents = refs(source.body.contents).flatMap((ref) =>
      plan.pooled.includes(ref.$ref)
        ? typesId
          ? [{ $ref: typesId }]
          : []
        : storeOf(ref.$ref) === target.name && !stripped.has(ref.$ref)
          ? [ref]
          : [],
    );
    if (typesId && !contents.some(({ $ref }) => $ref === typesId)) contents.push({ $ref: typesId });

    const kept = new Set(refs(source.body.dependencies).map(({ $ref }) => $ref));
    const stands = target.stands.flatMap(({ name, id }) =>
      id
        ? kept.has(id)
          ? [{ $ref: id }]
          : []
        : [{ $ref: mint(`${target.name} stands on ${name}`, when, target.name) }],
    );
    const { dependencies: _, ...body } = source.body;

    return marked(
      {
        ...source,
        id: rootId(target, when),
        name: target.name,
        body: { ...body, contents, ...(stands.length && { dependencies: stands }) },
      },
      types,
    );
  };

  // The dependencies a store's root stands on that the cut mints, each named for the store
  // it stands on and read as that store's shape.
  const dependenciesOf = (target: Target, when: string): Holon[] =>
    current.has(target.root.from)
      ? target.stands
          .filter(({ id }) => !id)
          .map(({ name }) => {
            const on = plan.stores.find((each) => each.name === name)!;
            const shape = current.get(on.root.from)?.body.shape ?? current.get(target.root.from)!.body.shape;
            return {
              id: mint(`${target.name} stands on ${name}`, when, target.name),
              instance: [plan.dependency],
              name,
              body: shape ? { shape } : {},
            };
          })
      : [];

  const stores = new Map(plan.stores.map(({ name }) => [name, strata(folderStorages(join(into, name)))]));
  const heads = new Map<string, Head | null>(plan.stores.map(({ name }) => [name, null]));
  const kept = new Map(plan.stores.map(({ name }) => [name, new Set<string>()]));

  for await (const was of replay(old, types)) {
    const reading = performance.now();
    const shares = new Map<string, Share>();
    const share = (store: string) =>
      shares.get(store) ?? shares.set(store, { holons: new Map(), gone: new Set() }).get(store)!;

    for (const { holon } of was.versions) {
      if (stripped.has(holon.id)) continue;
      if (sources.has(holon.id)) current.set(holon.id, cleaned(holon));
      else share(storeOf(holon.id)).holons.set(holon.id, cleaned(holon));
    }
    for (const id of was.gone) {
      if (stripped.has(id)) continue;
      if (sources.has(id)) current.delete(id);
      else share(storeOf(id)).gone.add(id);
    }

    const worked = new Map<string, Holon | null>();
    for (const target of plan.stores) {
      const typesWhole = typesOf(target, was.when);
      if (typesWhole) worked.set(typesWhole.id, typesWhole);
      for (const dependency of dependenciesOf(target, was.when)) worked.set(dependency.id, dependency);
      worked.set(rootId(target, was.when), rootOf(target, was.when, typesWhole?.id));
    }
    for (const [id, holon] of worked) {
      const text = holon && canonical(holon);
      if (text === (written.get(id) ?? null)) continue;
      if (holon) share(storeOf(id)).holons.set(id, holon);
      else share(storeOf(id)).gone.add(id);
      if (text) written.set(id, text);
      else written.delete(id);
    }

    if (!shares.size) {
      if (was.versions.length || was.gone.length) {
        spent.dropped++;
        continue;
      }
      share(plan.homes[was.from[0]!]!);
    }

    const touched = plan.stores.filter(({ name }) => shares.has(name));
    const gone = [...new Set(touched.flatMap(({ name }) => [...shares.get(name)!.gone]))].sort();
    const parts: Act["parts"] = [];
    for (const target of touched) {
      const part = partOf([...shares.get(target.name)!.holons.values()]);
      parts.push([rootId(target, was.when), part && (await hashOf(part))]);
    }
    const said = { when: was.when, says: was.says, at: [], gone, parts };
    const hash = await hashOf(contentOf(said));

    const offering = performance.now();
    spent.reading += offering - reading;

    for (const target of touched) {
      const { holons, gone: letGo } = shares.get(target.name)!;
      const own = kept.get(target.name)!;
      const act: Act = {
        ...said,
        hash,
        own: rootId(target, was.when),
        holons: [...holons.values()],
        born: [...holons.keys()].filter((id) => !own.has(id)),
        over: heads.get(target.name)!,
        touches: { ids: [...holons.keys(), ...letGo], addresses: [] },
      };

      const reply = await stores.get(target.name)!.offer(act);
      if (!("accepted" in reply))
        throw new Error(`${target.name} did not accept the act ${hash}: ${JSON.stringify(reply)}`);
      heads.set(target.name, reply.accepted);
      for (const id of holons.keys()) own.add(id);
    }

    spent.offering += performance.now() - offering;
    spent.acts++;
    told(spent);
  }

  return { spent, heads: Object.fromEntries(heads) };
}

// The old stores this repository holds, but the site, which is not cut.
export async function oldStores() {
  const found = await storesHere();
  return new Map([...found].filter(([name]) => name !== "site").map(([name, { store }]) => [name, store]));
}

if (import.meta.main) {
  const [into] = process.argv.slice(2);
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const said = ({ acts, dropped, placing, reading, offering }: Spent) =>
    `${acts} acts, ${dropped} dropped: placing ${seconds(placing)}, reading ${seconds(reading)}, strata ${seconds(offering)}`;

  const { spent } = await cut(await oldStores(), glassCut, into!, (spent) => {
    if (spent.acts % 50 === 0) console.log(said(spent));
  });
  console.log(said(spent), "— done");
}
