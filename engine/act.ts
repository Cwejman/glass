// The engine's part of a commit: which store keeps what, the ids of what is new, and
// whether the change may be made. Which store keeps what is the engine's; how an act is
// written is the format's.
//
// What the field knows of a change is read first, all of it, by factsOf. The plan is
// then worked out from those facts alone, by planOf, purely, in four steps:
//
//   residence  a holon kept resides where it is kept; a new one where the wholes of the
//              change holding it reside, or, held by nothing, in the store the change
//              names, or the only store written
//   roots      a holon nothing holds is said by the root of the store it goes to
//   mint       every handle given its id, each store's share one run
//   judge      the rules of judge.ts, every problem found
//
// A change brings holons into being under handles of its own, "~1" for one, used
// wherever an id goes; the engine gives them their ids. No other id new to the field is
// taken, unless it is derived from what an integration reads.

import { isId, nextId, type Holon, type Store } from "../integrations/glass/store.ts";
import { holonOf, isWritable, keepersOf, type Attachment, type Field } from "./field.ts";
import { isHandle } from "./handles.ts";
import { judge, type Problem } from "./judge.ts";
import { isRoot, mouldOf, references } from "./moulds.ts";

export type { Problem };

export type Change = { holons: Holon[]; gone?: string[]; says?: string; into?: string };

// What the field knows of a change.
export type Known = {
  attached: readonly Attachment[];
  // The stores keeping each holon of the change now, and each that goes.
  kept: ReadonlyMap<string, readonly string[]>;
  // The holons of the field the change refers to, as types or by reference.
  referred: ReadonlyMap<string, Holon>;
  // The holons of the field that refer to what goes.
  referring: readonly Holon[];
  // The root of the store a holon nothing holds would go to, where one would.
  root?: Holon;
};

// A holon of the change as it lands: the handle it came under, if it is new, the stores
// that keep it now, and those it resides in after.
export type Landing = { holon: Holon; handle?: string; was: readonly string[]; stores: readonly string[] };

// What a change comes to: each store's share, the ids minted, and every problem found.
export type Plan = {
  landing: Landing[];
  stores: { key: string; store: Store; holons: Holon[]; gone: string[] }[];
  born: string[];
  ids: Record<string, string>;
  problems: Problem[];
};

// The plan of a change, from what the field knows of it and the first id it may mint.
export function planOf(facts: Known, change: Change, start: string): Plan {
  const gone = change.gone ?? [];
  const placed = residence(facts, change);
  const rooted = roots(facts, placed.landing, placed.loose, looseStore(facts.attached, change));
  const { landing, ids } = mint(facts, rooted, start);

  const goneFrom = (key: string) => gone.filter((id) => facts.kept.get(id)?.includes(key));
  const touched = facts.attached.filter(
    ({ key }) => landing.some(({ stores }) => stores.includes(key)) || goneFrom(key).length,
  );
  const nothing: Problem[] = touched.length
    ? []
    : [{ rule: "residence", says: "the commit changes nothing: it writes no holon and takes nothing out" }];

  const handleOf = new Map(landing.map(({ holon, handle }) => [holon.id, handle]));
  const problems = [
    ...placed.problems,
    ...judge({
      landing,
      gone,
      kept: facts.kept,
      readOnly: new Set(facts.attached.filter(({ write }) => !write).map(({ key }) => key)),
      referred: facts.referred,
      referring: facts.referring,
    }),
    ...nothing,
  ].map((problem) => ({ ...problem, ...(problem.id && { id: handleOf.get(problem.id) ?? problem.id }) }));

  return {
    landing,
    stores: touched.filter(isWritable).map(({ key, store }) => ({
      key,
      store,
      holons: landing.filter(({ stores }) => stores.includes(key)).map(({ holon }) => holon),
      gone: goneFrom(key),
    })),
    born: Object.values(ids),
    ids,
    problems,
  };
}

// What the field knows of a change, read all at once.
export async function factsOf(field: Field, change: Change): Promise<Known> {
  const gone = change.gone ?? [];
  const keepers = async (ids: readonly string[]) =>
    Promise.all(ids.map(async (id) => [id, (await keepersOf(field, id)).map(({ key }) => key)] as const));

  const kept = new Map(
    (await keepers([...change.holons.map(({ id }) => id).filter(isId), ...gone])).filter(
      ([, keys]) => keys.length,
    ),
  );
  const referred = await referredBy(field, change.holons);
  const looseInto = looseStore(field.stores, change);
  const root =
    looseInto && anyLoose(change.holons, { referred, kept }) ? await rootIn(field, looseInto) : undefined;
  if (root) kept.set(root.id, (await keepers([root.id]))[0]![1]);

  return {
    attached: field.stores,
    kept,
    referred: root ? new Map([...referred, ...(await referredBy(field, [root]))]) : referred,
    referring: await referringTo(field, gone),
    root,
  };
}

// ---- Residence

// The store a holon nothing holds goes to: the one the change names, or the only one
// written, if either is.
function looseStore(attached: readonly Attachment[], { into }: Change) {
  if (into) return attached.some(({ key }) => key === into) ? into : undefined;

  const writable = attached.filter(isWritable);
  return writable.length === 1 ? writable[0]!.key : undefined;
}

// The holons of a change each holds, read through their types: only those no store
// keeps, for a holon kept resides where it is kept.
function heldBy(holons: readonly Holon[], { referred, kept }: Pick<Known, "referred" | "kept">) {
  const byId = new Map(holons.map((holon) => [holon.id, holon]));
  const held = new Map<string, string[]>();

  for (const holon of holons) {
    const mould = mouldOf(holon.instance.map((type) => byId.get(type) ?? referred.get(type)));
    const parts = references(holon.body, mould).filter(
      ({ id, holds }) => holds && byId.has(id) && !kept.has(id),
    );
    held.set(
      holon.id,
      parts.map(({ id }) => id),
    );
  }

  return held;
}

// Whether a holon no store keeps is held by nothing in the change.
function anyLoose(holons: readonly Holon[], facts: Pick<Known, "referred" | "kept">) {
  const held = new Set([...heldBy(holons, facts).values()].flat());
  return holons.some(({ id }) => !facts.kept.has(id) && !held.has(id));
}

// Where each holon of a change resides. A kept one where it is kept; a new one in every
// store the holons of the change that hold it reside in; one nothing holds, and one held
// only within a ring of new holons, in the store loose holons go to.
function residence(facts: Known, change: Change) {
  const { holons } = change;
  const order = facts.attached.map(({ key }) => key);
  const into = looseStore(facts.attached, change);
  const held = heldBy(holons, facts);
  const holdsSome = new Set([...held.values()].flat());

  const isNew = (id: string) => !facts.kept.has(id);
  const resides = new Map<string, Set<string>>(holons.map(({ id }) => [id, new Set(facts.kept.get(id))]));

  // Each holon's stores carried down to what it holds, until nothing more is learned.
  const carry = (from: readonly string[]) => {
    const queue = [...from];
    while (queue.length) {
      const id = queue.pop()!;
      for (const part of held.get(id) ?? []) {
        const stores = resides.get(part)!;
        const before = stores.size;
        for (const key of resides.get(id)!) stores.add(key);
        if (stores.size > before) queue.push(part);
      }
    }
  };

  const loose = holons.filter(({ id }) => isNew(id) && !holdsSome.has(id)).map(({ id }) => id);
  const unplaced = () => holons.filter(({ id }) => isNew(id) && !resides.get(id)!.size).map(({ id }) => id);

  for (const id of loose) if (into) resides.get(id)!.add(into);
  carry(holons.map(({ id }) => id));
  for (const id of unplaced()) if (into) resides.get(id)!.add(into);
  carry(holons.map(({ id }) => id));

  const problems: Problem[] = [
    ...(change.into && !into ? [{ rule: "residence", says: `nothing is attached as ${change.into}` }] : []),
    ...unplaced().map((id) => ({
      rule: "residence",
      id,
      says: "it is held by nothing in this commit: say into which store it goes",
    })),
  ];

  const landing = holons.map(
    (holon): Landing => ({
      holon,
      ...(isHandle(holon.id) && { handle: holon.id }),
      was: facts.kept.get(holon.id) ?? [],
      stores: order.filter((key) => resides.get(holon.id)!.has(key)),
    }),
  );

  return { landing, loose: into ? loose : [], problems };
}

// ---- Roots

// The holons of a change with what nothing holds said by its store's root: the root the
// change itself says, or else the store's, said again. A root holds itself in nothing.
function roots(facts: Known, landing: Landing[], loose: readonly string[], into?: string): Landing[] {
  const byId = new Map(landing.map(({ holon }) => [holon.id, holon]));
  const typeOf = (id: string) => byId.get(id) ?? facts.referred.get(id);
  const joining = loose.filter((id) => !isRoot(byId.get(id)!, typeOf));
  if (!into || !joining.length) return landing;

  const ownRoot = landing.find(({ holon, stores }) => stores.includes(into) && isRoot(holon, typeOf));
  const kept = facts.root && (facts.kept.get(facts.root.id) ?? [into]);
  const root = ownRoot ?? (facts.root && { holon: facts.root, was: kept!, stores: kept! });
  if (!root) return landing;

  const contents = [
    ...((root.holon.body.contents ?? []) as { $ref: string }[]),
    ...joining.map(($ref) => ({ $ref })),
  ];
  const said = { ...root, holon: { ...root.holon, body: { ...root.holon.body, contents } } };

  return ownRoot ? landing.map((one) => (one === ownRoot ? said : one)) : [...landing, said];
}

// ---- Mint

// Each handle given its id: one run from the start, each store's share together, in the
// order the stores are attached; a handle that resides nowhere last, so a refusal can
// name it. A handle no holon of the change comes under is left as it is.
function mint(facts: Known, landing: Landing[], start: string) {
  const ids: Record<string, string> = {};
  let next = start;
  const give = (handle: string) => {
    if (handle in ids) return;
    ids[handle] = next;
    next = nextId(next);
  };

  for (const { key } of facts.attached)
    for (const { handle, stores } of landing) if (handle && stores.includes(key)) give(handle);
  for (const { handle } of landing) if (handle) give(handle);

  return { landing: landing.map((one) => ({ ...one, holon: withIds(one.holon, ids) })), ids };
}

// A holon with every handle given an id put in its place: its own, its types', and what
// it refers to. Nothing else in it is touched, so text may begin as it likes.
function withIds(holon: Holon, ids: Readonly<Record<string, string>>): Holon {
  const idOf = (value: string) => (isHandle(value) ? (ids[value] ?? value) : value);
  const inBody = (value: unknown): any => {
    if (Array.isArray(value)) return value.map(inBody);
    if (typeof value !== "object" || value === null) return value;

    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        key === "$ref" ? idOf(inner as string) : inBody(inner),
      ]),
    );
  };

  return { ...holon, id: idOf(holon.id), instance: holon.instance.map(idOf), body: inBody(holon.body) };
}

// ---- What is read of the field

// The holons of the field the holons given refer to, as their types or by reference.
async function referredBy(field: Field, holons: readonly Holon[]) {
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

  const world = await field.world();
  const going = new Set(gone);
  const from = new Set(gone.flatMap((id) => world.holders(id).map((holder) => holder.from)));

  return [...world.known.values()]
    .map(({ holon }) => holon)
    .filter((holon) => from.has(holon.id) || holon.instance.some((type) => going.has(type)));
}

// A store's root, read from the store whole.
async function rootIn(field: Field, key: string) {
  const holons = (await field.holonsOf(key)).map(({ holon }) => holon);
  const typeIds = [...new Set(holons.flatMap(({ instance }) => instance))];
  const types = new Map(
    await Promise.all(typeIds.map(async (id) => [id, await holonOf(field, id)] as const)),
  );

  return holons.find((holon) => isRoot(holon, (id) => types.get(id)));
}
