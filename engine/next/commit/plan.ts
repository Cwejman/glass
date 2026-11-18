// The plan of a change, worked out purely from what the field knows of it (known.ts),
// in four steps, each a function beneath:
//
//   residence  a holon kept resides where it is kept; a new one where the wholes of the
//              change holding it reside, or, held by nothing, in the store the change
//              names, or the only store written
//   roots      a holon nothing holds is held by the root of the store it goes to
//   mint       every handle given its id, one run from the first
//   judge      the rules of rules.ts, every problem found
//
// Problems are said by the handles the change used, so the caller knows what they name.

import { idAt, nextId } from "../../../integrations/glass/store.ts";
import type { Holon, Problem } from "../../../stores/store.ts";
import { isRoot, mouldOf } from "../../moulds.ts";
import { isHandle, type Change } from "./change.ts";
import type { Known } from "./known.ts";
import { judge } from "./rules.ts";

// A holon of the change as it lands: the handle it came under, if it is new, the stores
// that keep it now, and those it resides in after.
export type Landing = { holon: Holon; handle?: string; was: readonly string[]; stores: readonly string[] };

// One store's share: the id of its root, the holons it keeps of the change, those it
// lets go, and which of its holons are new.
export type Share = { store: string; root: string; holons: Holon[]; gone: string[]; born: string[] };

// What a change comes to: each written store's share, the ids minted, and every problem.
export type Plan = { shares: Share[]; ids: Record<string, string>; problems: Problem[] };

export function planOf(known: Known, change: Change): Plan {
  const gone = change.gone ?? [];
  const placed = residence(known, change);
  const rooted = roots(known, placed.landing, placed.loose, looseStore(known, change));
  const { landing, ids } = mint(known, rooted);
  const touched = known.stores.filter(
    ({ name }) => landing.some(({ stores }) => stores.includes(name)) || goneFrom(known, gone, name).length,
  );

  const problems = [
    ...placed.problems,
    ...judge({
      landing,
      gone,
      kept: known.kept,
      readOnly: new Set(known.stores.filter(({ write }) => !write).map(({ name }) => name)),
      admits: known.admits,
      referred: known.referred,
      kinds: known.kinds,
      holding: known.holding,
      referring: known.referring,
    }),
    ...(touched.length ? [] : [changesNothing]),
  ];

  const born = new Set(Object.values(ids));
  const byId = new Map(landing.map(({ holon }) => [holon.id, holon]));
  const typeOf = (id: string) => byId.get(id) ?? known.referred.get(id);
  const shares = touched
    .filter(({ write }) => write)
    .map(({ name }) => {
      const holons = landing.filter(({ stores }) => stores.includes(name)).map(({ holon }) => holon);
      const root =
        known.roots.get(name) ?? holons.find((holon) => isRoot(holon as never, typeOf as never))?.id;
      if (!root)
        problems.push({
          rule: "residence",
          says: `${name} has no root, so a commit cannot name it: write its root first`,
        });

      return {
        store: name,
        root: root ?? "",
        holons,
        gone: goneFrom(known, gone, name),
        born: holons.flatMap(({ id }) => (born.has(id) ? [id] : [])),
      };
    });

  return { shares, ids, problems: inHandles(landing, problems) };
}

const changesNothing: Problem = {
  rule: "residence",
  says: "the commit changes nothing: it writes no holon and takes nothing out",
};

const goneFrom = (known: Known, gone: readonly string[], name: string) =>
  gone.filter((id) => known.kept.get(id)?.includes(name));

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
export function looseStore(known: Pick<Known, "stores">, { into }: Pick<Change, "into">) {
  if (into) return known.stores.some(({ name }) => name === into) ? into : undefined;

  const written = known.stores.filter(({ write }) => write);
  return written.length === 1 ? written[0]!.name : undefined;
}

// Whether a reference holds: as it says itself, or as its key's field in the mould says.
const holdsBy = (holon: Holon, typeOf: (id: string) => Holon | undefined) => {
  const mould = mouldOf(holon.instance.map(typeOf) as never[]);
  return (key: string, value: { $ref: string; $holds?: boolean }) =>
    value.$holds ?? mould[key]?.holds === true;
};

// The holons of a change each holds: only those no store keeps, for a holon kept resides
// where it is kept.
function heldBy(holons: readonly Holon[], { referred, kept }: Pick<Known, "referred" | "kept">) {
  const byId = new Map(holons.map((holon) => [holon.id, holon]));
  const typeOf = (id: string) => byId.get(id) ?? referred.get(id);

  return new Map(
    holons.map((holon) => [holon.id, partsOf(holon, typeOf).filter((id) => byId.has(id) && !kept.has(id))]),
  );
}

// What a holon holds, read through its types.
export function partsOf(holon: Holon, typeOf: (id: string) => Holon | undefined) {
  const holds = holdsBy(holon, typeOf);
  const found: string[] = [];

  const walk = (value: unknown, key: string): void => {
    if (Array.isArray(value)) value.forEach((item) => walk(item, key));
    else if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { $ref?: unknown }).$ref === "string"
    ) {
      if (holds(key, value as { $ref: string })) found.push((value as { $ref: string }).$ref);
    } else if (typeof value === "object" && value !== null)
      Object.values(value).forEach((inner) => walk(inner, key));
  };

  for (const [key, value] of Object.entries(holon.body)) walk(value, key);
  return found;
}

// Whether a holon no store keeps is held by nothing in the change.
export function anyLoose(holons: readonly Holon[], known: Pick<Known, "referred" | "kept">) {
  const held = new Set([...heldBy(holons, known).values()].flat());
  return holons.some(({ id }) => !known.kept.has(id) && !held.has(id));
}

// Where each holon of a change resides. A kept one where it is kept; a new one in every
// store the holons of the change that hold it reside in; one nothing holds in the store
// loose holons go to.
function residence(known: Known, change: Change) {
  const { holons } = change;
  const order = known.stores.map(({ name }) => name);
  const into = looseStore(known, change);
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
        for (const name of resides.get(id)!) stores.add(name);
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
    ...(change.into && !into ? [{ rule: "residence", says: `nothing is mounted as ${change.into}` }] : []),
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
      stores: order.filter((name) => resides.get(holon.id)!.has(name)),
    }),
  );

  return { landing, loose: into ? loose : [], problems };
}

// ---- Roots

// The holons of a change with what nothing holds held by its store's root: the root the
// change itself writes, or else the store's, written again. A root holds itself in nothing.
function roots(known: Known, landing: Landing[], loose: readonly string[], into?: string): Landing[] {
  const byId = new Map(landing.map(({ holon }) => [holon.id, holon]));
  const typeOf = (id: string) => byId.get(id) ?? known.referred.get(id);
  const joining = loose.filter((id) => !isRoot(byId.get(id)! as never, typeOf as never));
  if (!into || !joining.length) return landing;

  const ownRoot = landing.find(
    ({ holon, stores }) => stores.includes(into) && isRoot(holon as never, typeOf as never),
  );
  const kept = known.root && (known.kept.get(known.root.id) ?? [into]);
  const root = ownRoot ?? (known.root && { holon: known.root, was: kept!, stores: kept! });
  if (!root) return landing;

  const contents = [
    ...((root.holon.body.contents ?? []) as { $ref: string }[]),
    ...joining.map(($ref) => ({ $ref, $holds: true })),
  ];
  const said = { ...root, holon: { ...root.holon, body: { ...root.holon.body, contents } } };

  return ownRoot ? landing.map((one) => (one === ownRoot ? said : one)) : [...landing, said];
}

// ---- Mint

// Each handle given its id: one run from a moment with a count begun at a chance point,
// each store's share together, in the order the stores were mounted; a handle that
// resides nowhere last, so a refusal can name it. Every reference that holds is marked
// so, as every store keeps it.
function mint(known: Known, landing: Landing[]) {
  const ids: Record<string, string> = {};
  let next = idAt(Date.now(), (crypto.getRandomValues(new Uint32Array(1))[0]! % 32768) * 32768);
  const give = (handle: string) => {
    if (handle in ids) return;
    ids[handle] = next;
    next = nextId(next);
  };

  for (const { name } of known.stores)
    for (const { handle, stores } of landing) if (handle && stores.includes(name)) give(handle);
  for (const { handle } of landing) if (handle) give(handle);

  const byId = new Map(landing.map(({ holon }) => [holon.id, holon]));
  const typeOf = (id: string) => byId.get(id) ?? known.referred.get(id);

  return {
    landing: landing.map((one) => ({ ...one, holon: marked(withIds(one.holon, ids), one.holon, typeOf) })),
    ids,
  };
}

// A holon with every handle given an id put in its place: its own, its types', and what
// it refers to. Nothing else in it is touched, so text may begin as it likes.
function withIds(holon: Holon, ids: Readonly<Record<string, string>>): Holon {
  const idOf = (value: string) => (isHandle(value) ? (ids[value] ?? value) : value);
  const inBody = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(inBody);
    if (typeof value !== "object" || value === null) return value;

    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        key === "$ref" ? idOf(inner as string) : inBody(inner),
      ]),
    );
  };

  return {
    ...holon,
    id: idOf(holon.id),
    instance: holon.instance.map(idOf),
    body: inBody(holon.body) as Holon["body"],
  };
}

// A holon whose references that hold, by its types' moulds, say so themselves.
function marked(holon: Holon, before: Holon, typeOf: (id: string) => Holon | undefined): Holon {
  const holds = holdsBy(before, typeOf);
  const mark = (value: unknown, key: string): unknown => {
    if (Array.isArray(value)) return value.map((item) => mark(item, key));
    if (typeof value !== "object" || value === null) return value;
    if (typeof (value as { $ref?: unknown }).$ref === "string") {
      const { $holds: _, ...ref } = value as { $ref: string; $holds?: boolean };
      return holds(key, value as { $ref: string }) ? { ...ref, $holds: true } : ref;
    }
    return Object.fromEntries(Object.entries(value).map(([inner, held]) => [inner, mark(held, key)]));
  };

  return {
    ...holon,
    body: Object.fromEntries(Object.entries(holon.body).map(([key, value]) => [key, mark(value, key)])),
  };
}
