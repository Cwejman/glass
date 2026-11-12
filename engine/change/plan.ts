// The plan of a change: worked out purely from what the field knows of it (known.ts),
// in four steps, each a function beneath:
//
//   residence  a holon kept resides where it is kept; a new one where the wholes of the
//              change holding it reside, or, held by nothing, in the store the change
//              names, or the only store written
//   roots      a holon nothing holds is said by the root of the store it goes to
//   mint       every handle given its id, each store's share one run
//   judge      the rules of rules.ts, every problem found
//
// A change brings holons into being under handles of its own, "~1" for one, used
// wherever an id goes; the engine gives them their ids. No other id new to the field is
// taken, unless it is derived from what an integration reads.

import { nextId, type Holon, type Store } from "../../integrations/glass/store.ts";
import { isWritable, type Attachment } from "../field.ts";
import { isHandle } from "../handles.ts";
import { judge, type Problem } from "./rules.ts";
import { isRoot, mouldOf, references } from "../moulds.ts";

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

// The plan of a change, from what the field knows of it and the first id it may mint:
// where each holon resides, the roots that say what nothing holds, the ids given, each
// store's share, and every problem, said by the handles the change used.
export function planOf(known: Known, change: Change, start: string): Plan {
  const gone = change.gone ?? [];
  const placed = residence(known, change);
  const rooted = roots(known, placed.landing, placed.loose, looseStore(known.attached, change));
  const { landing, ids } = mint(known, rooted, start);
  const touched = touchedBy(known, landing, gone);

  return {
    landing,
    stores: sharesOf(touched, landing, known, gone),
    born: Object.values(ids),
    ids,
    problems: inHandles(landing, [
      ...placed.problems,
      ...judged(known, landing, gone),
      ...(touched.length ? [] : [changesNothing]),
    ]),
  };
}

// ---- What a plan is made of

const changesNothing: Problem = {
  rule: "residence",
  says: "the commit changes nothing: it writes no holon and takes nothing out",
};

const goneFrom = (known: Known, gone: readonly string[], key: string) =>
  gone.filter((id) => known.kept.get(id)?.includes(key));

// The stores an act touches: those a holon lands in, and those something goes from.
const touchedBy = (known: Known, landing: readonly Landing[], gone: readonly string[]) =>
  known.attached.filter(
    ({ key }) => landing.some(({ stores }) => stores.includes(key)) || goneFrom(known, gone, key).length,
  );

// Each written store's share: what lands in it, and what goes from it.
const sharesOf = (
  touched: readonly Attachment[],
  landing: readonly Landing[],
  known: Known,
  gone: readonly string[],
) =>
  touched.filter(isWritable).map(({ key, store }) => ({
    key,
    store,
    holons: landing.filter(({ stores }) => stores.includes(key)).map(({ holon }) => holon),
    gone: goneFrom(known, gone, key),
  }));

// The rules of rules.ts, given what they weigh.
const judged = (known: Known, landing: readonly Landing[], gone: readonly string[]) =>
  judge({
    landing: [...landing],
    gone: [...gone],
    kept: known.kept,
    readOnly: new Set(known.attached.filter(({ write }) => !write).map(({ key }) => key)),
    referred: known.referred,
    referring: known.referring,
  });

// Problems said by the handles the change used, where a holon came under one.
function inHandles(landing: readonly Landing[], problems: readonly Problem[]) {
  const handleOf = new Map(landing.map(({ holon, handle }) => [holon.id, handle]));
  return problems.map((problem) => ({
    ...problem,
    ...(problem.id && { id: handleOf.get(problem.id) ?? problem.id }),
  }));
}

// ---- Residence

// The store a holon nothing holds goes to: the one the change names, or the only one
// written, if either is.
export function looseStore(attached: readonly Attachment[], { into }: Change) {
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
export function anyLoose(holons: readonly Holon[], known: Pick<Known, "referred" | "kept">) {
  const held = new Set([...heldBy(holons, known).values()].flat());
  return holons.some(({ id }) => !known.kept.has(id) && !held.has(id));
}

// Where each holon of a change resides. A kept one where it is kept; a new one in every
// store the holons of the change that hold it reside in; one nothing holds, and one held
// only within a ring of new holons, in the store loose holons go to.
function residence(known: Known, change: Change) {
  const { holons } = change;
  const order = known.attached.map(({ key }) => key);
  const into = looseStore(known.attached, change);
  const held = heldBy(holons, known);
  const holdsSome = new Set([...held.values()].flat());

  const isNew = (id: string) => !known.kept.has(id);
  const resides = new Map<string, Set<string>>(holons.map(({ id }) => [id, new Set(known.kept.get(id))]));

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
      was: known.kept.get(holon.id) ?? [],
      stores: order.filter((key) => resides.get(holon.id)!.has(key)),
    }),
  );

  return { landing, loose: into ? loose : [], problems };
}

// ---- Roots

// The holons of a change with what nothing holds said by its store's root: the root the
// change itself says, or else the store's, said again. A root holds itself in nothing.
function roots(known: Known, landing: Landing[], loose: readonly string[], into?: string): Landing[] {
  const byId = new Map(landing.map(({ holon }) => [holon.id, holon]));
  const typeOf = (id: string) => byId.get(id) ?? known.referred.get(id);
  const joining = loose.filter((id) => !isRoot(byId.get(id)!, typeOf));
  if (!into || !joining.length) return landing;

  const ownRoot = landing.find(({ holon, stores }) => stores.includes(into) && isRoot(holon, typeOf));
  const kept = known.root && (known.kept.get(known.root.id) ?? [into]);
  const root = ownRoot ?? (known.root && { holon: known.root, was: kept!, stores: kept! });
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
function mint(known: Known, landing: Landing[], start: string) {
  const ids: Record<string, string> = {};
  let next = start;
  const give = (handle: string) => {
    if (handle in ids) return;
    ids[handle] = next;
    next = nextId(next);
  };

  for (const { key } of known.attached)
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
