// The engine's part of a commit: which store keeps what, the ids of what is new, and
// whether the change may be made. How an act is written is the format's; which store
// keeps what is the engine's. The steps, in order, each pure:
//
//   residence  a holon kept goes where it is kept; a new one where the whole holding it
//              goes, or into the store the change names, or the only store written;
//              a store taking a holon nothing holds has its root say it
//   mint       every handle given its id, each store's share one run where it can be
//   judge      the rules of judge.ts
//
// What the steps need of the field is read first, at the top, so they read nothing.
//
// A change brings holons into being under handles of its own, "~1" for one, used
// wherever an id goes; the engine gives them their ids. No other id new to the field is
// taken, unless it is derived from what an integration reads.

import { idAt, isId, nextId, type Holon } from "../integrations/glass/store.ts";
import { holonOf, isWritable, keepersOf, type Field } from "./field.ts";
import { judge } from "./judge.ts";
import { isRoot, mouldOf, references } from "./moulds.ts";

export type Change = { holons: Holon[]; gone?: string[]; says?: string; into?: string };

// What to write: each store's holons, what goes, the ids minted, and for each handle its id.
export type Act = {
  writes: { key: string; holons: Holon[] }[];
  gone: string[];
  born: string[];
  ids: Record<string, string>;
};

export const isHandle = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("~");

// Handles in order, "~1", "~2", for a writer bringing holons into being.
export function handles() {
  let count = 0;
  return () => `~${++count}`;
}

// ---- Residence

type Keys = ReadonlyMap<string, readonly string[]>;

// Where each holon of a change lands, by the keys of the stores, and which of them
// nothing holds, so its store's root takes it.
export function residence(
  holons: readonly Holon[],
  {
    kept,
    named,
    writable,
    into,
  }: { kept: Keys; named: ReadonlyMap<string, Holon>; writable: string[]; into?: string },
) {
  const byId = new Map(holons.map((holon) => [holon.id, holon]));

  // The holons of this change that hold each new one, read through their types. A handle
  // is no id, so each stands in as one no store can hold while references are read.
  const standIn = new Map(holons.filter(({ id }) => isHandle(id)).map(({ id }, i) => [id, idAt(0, i)]));
  const handleOf = new Map([...standIn].map(([handle, id]) => [id, handle]));
  const holders = new Map<string, string[]>();

  for (const holon of holons) {
    const mould = mouldOf(holon.instance.map((type) => byId.get(type) ?? named.get(type)));

    for (const reference of references(withIds(holon, standIn).body, mould)) {
      const id = handleOf.get(reference.id) ?? reference.id;
      if (reference.holds && byId.has(id) && !kept.has(id))
        holders.set(id, [...(holders.get(id) ?? []), holon.id]);
    }
  }

  const route = new Map<string, readonly string[]>();
  const loose = new Set<string>();

  function placeOf(id: string, seen: ReadonlySet<string>): readonly string[] {
    const known = kept.get(id) ?? route.get(id);
    if (known) return known;

    const fromHolders = [
      ...new Set(
        (holders.get(id) ?? [])
          .filter((holder) => !seen.has(holder))
          .flatMap((holder) => placeOf(holder, new Set([...seen, id]))),
      ),
    ];
    if (fromHolders.length) return fromHolders;

    if (into || writable.length === 1) loose.add(id);
    if (into) return [into];
    if (writable.length === 1) return writable;

    throw new Error(
      `${byId.get(id)?.name ?? id} is held by nothing in this commit: say into which store it goes`,
    );
  }

  for (const { id } of holons) route.set(id, placeOf(id, new Set()));

  return { route, loose };
}

// The holons of a change with each store's root said again where a holon nothing holds
// lands in it, so a store's root goes on holding all its top.
export function withRoots(
  holons: readonly Holon[],
  route: Keys,
  loose: ReadonlySet<string>,
  roots: ReadonlyMap<string, Holon>,
) {
  const joining = new Map<string, string[]>();
  for (const id of loose)
    for (const key of route.get(id)!) joining.set(key, [...(joining.get(key) ?? []), id]);

  const said: Holon[] = [];
  const routed = new Map(route);

  for (const [key, ids] of joining) {
    const root = roots.get(key);
    if (!root || holons.some(({ id }) => id === root.id)) continue;

    const contents = [
      ...((root.body.contents ?? []) as { $ref: string }[]),
      ...ids.map(($ref) => ({ $ref })),
    ];
    said.push({ ...root, body: { ...root.body, contents } });
    routed.set(root.id, [key]);
  }

  return { holons: [...holons, ...said], route: routed as Keys };
}

// ---- Mint

// Each handle given its id: one run from the start given, each store's share together,
// in the order the stores are given.
export function mint(holons: readonly Holon[], route: Keys, stores: readonly string[], start: string) {
  const ids = new Map<string, string>();
  let next = start;

  for (const key of stores) {
    for (const { id } of holons) {
      if (isHandle(id) && !ids.has(id) && route.get(id)!.includes(key)) {
        ids.set(id, next);
        next = nextId(next);
      }
    }
  }

  return ids;
}

// A holon with every handle in it given its id: its own, its types, and what it refers
// to. Nothing else in it is touched, so text may begin as it likes.
export function withIds(holon: Holon, ids: ReadonlyMap<string, string>): Holon {
  const idOf = (handle: string) => {
    const id = ids.get(handle);
    if (!id) throw new Error(`the handle ${handle} names nothing this commit brings into being`);

    return id;
  };

  const inBody = (value: unknown): any => {
    if (Array.isArray(value)) return value.map(inBody);
    if (typeof value !== "object" || value === null) return value;

    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        key === "$ref" && isHandle(inner) ? idOf(inner) : inBody(inner),
      ]),
    );
  };

  return {
    ...holon,
    id: isHandle(holon.id) ? idOf(holon.id) : holon.id,
    instance: holon.instance.map((type) => (isHandle(type) ? idOf(type) : type)),
    body: inBody(holon.body),
  };
}

// ---- What the steps read of the field

// The stores that keep each id now.
async function keptOf(field: Field, ids: readonly string[]) {
  const kept = await Promise.all(
    ids.map(async (id) => [id, (await keepersOf(field, id)).map(({ key }) => key)] as const),
  );

  return new Map(kept.filter(([, keys]) => keys.length));
}

// The holons of the field that the holons given name, as their types or by reference.
async function namedBy(field: Field, holons: readonly Holon[]) {
  const own = new Set(holons.map(({ id }) => id));
  const ids = new Set(
    holons.flatMap((holon) => [...holon.instance, ...references(holon.body).map(({ id }) => id)]),
  );
  const found = await Promise.all(
    [...ids]
      .filter((id) => isId(id) && !own.has(id))
      .map(async (id) => [id, await holonOf(field, id)] as const),
  );

  return new Map(found.flatMap(([id, holon]) => (holon ? [[id, holon] as const] : [])));
}

// The holons of the field that refer to what goes, by a reference or as its instances.
async function referringTo(field: Field, gone: readonly string[]) {
  if (!gone.length) return [];

  const all = await field.everything();
  const going = new Set(gone);
  const from = new Set(gone.flatMap((id) => (all.holders.get(id) ?? []).map((holder) => holder.from)));

  return [...all.known.values()]
    .map(({ holon }) => holon)
    .filter((holon) => from.has(holon.id) || holon.instance.some((type) => going.has(type)));
}

// A store's root, read from the store whole: asked only where a holon nothing holds lands.
async function rootIn(field: Field, key: string) {
  const holons = (await field.storeHolons(key)).map(({ holon }) => holon);
  const typeIds = [...new Set(holons.flatMap(({ instance }) => instance))];
  const types = new Map(
    await Promise.all(typeIds.map(async (id) => [id, await holonOf(field, id)] as const)),
  );

  return holons.find((holon) => isRoot(holon, (id) => types.get(id)));
}

// ---- The act

// The engine's part of a change, in order: what to write in each store, or why not.
export async function actOf(field: Field, { holons: asked, gone = [], into }: Change): Promise<Act> {
  if (into && !field.stores.some(({ key }) => key === into))
    throw new Error(`nothing is attached as ${into}`);

  const writable = field.stores.filter(isWritable).map(({ key }) => key);
  const kept = await keptOf(field, [...asked.map(({ id }) => id).filter(isId), ...gone]);
  const named = await namedBy(field, asked);

  const placed = residence(asked, { kept, named, writable, into });
  const looseIn = new Set([...placed.loose].flatMap((id) => placed.route.get(id)!));
  const roots = new Map(
    (await Promise.all([...looseIn].map(async (key) => [key, await rootIn(field, key)] as const))).flatMap(
      ([key, root]) => (root ? [[key, root] as const] : []),
    ),
  );
  const { holons, route } = withRoots(asked, placed.route, placed.loose, roots);

  const goneFrom = gone.map((id) => [id, kept.get(id) ?? []] as const);
  const touched = field.stores.filter(({ key }) =>
    [...route.values(), ...goneFrom.map(([, keys]) => keys)].some((keys) => keys.includes(key)),
  );
  if (!touched.length)
    throw new Error("the commit changes nothing: it writes no holon and takes nothing out");

  // A handle only a store read would take is refused in judging, and is given an id all
  // the same, so the refusal can name it.
  const writing = touched.filter(isWritable);
  const start =
    writing
      .map(({ store }) => store.minter()())
      .sort()
      .at(-1) ?? idAt(Date.now());
  const ids = mint(
    holons,
    route,
    touched.map(({ key }) => key),
    start,
  );
  const landing = holons.map((holon) => withIds(holon, ids));
  const reaches = new Map([
    ...holons.map(({ id }, i) => [landing[i]!.id, route.get(id)!] as const),
    ...goneFrom,
  ]);

  // The roots said again are kept already, and may name what the change does not.
  const rootsSaid = landing.slice(asked.length);
  const problem = judge({
    holons: landing,
    gone,
    minted: new Map([...ids].map(([handle, id]) => [id, handle])),
    kept: new Map([
      ...kept,
      ...(await keptOf(
        field,
        rootsSaid.map(({ id }) => id),
      )),
    ]),
    reaches,
    readOnly: new Set(field.stores.filter(({ write }) => !write).map(({ key }) => key)),
    named: new Map([...named, ...(await namedBy(field, rootsSaid))]),
    referring: await referringTo(field, gone),
  });
  if (problem) throw new Error(problem);

  return {
    writes: writing.map(({ key }) => ({
      key,
      holons: landing.filter(({ id }) => reaches.get(id)!.includes(key)),
    })),
    gone,
    born: [...ids.values()],
    ids: Object.fromEntries(ids),
  };
}
