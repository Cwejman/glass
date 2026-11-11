// The engine holds the stores it attaches and is the only way into them. It keeps no
// store of its own: it starts from the attachments it is given, each saying whether it
// may be written, and takes attaches and commits one at a time, each making the next
// field from the one before, and tells whoever listens that the field has changed.
//
// A commit is one act, written to every store it touches. A holon already kept is
// written where it is kept; a new one where the whole that holds it is, or where the
// commit says; what goes leaves every store that keeps it.
//
// A commit may bring holons into being under handles of its own, "~1" for one, and
// use them wherever an id goes. The engine gives them their ids as it lands, so
// whoever asks need not wait to refer to what it is making.

import { act, idAt, isId, nextId, openStore, type Holon, type Store } from "../integrations/glass/store.ts";
import { fieldOf, holonOf, keepersOf, read, type Attached, type Field } from "./field.ts";
import { bodyProblem, mouldOf, mouldProblem, type Mould } from "./moulds.ts";
import type { Answer, HolonRead, Read, Whole } from "./reads.ts";
import { references } from "./references.ts";

export type { Attached, HolonRead, Read, Whole };

export type Change = { holons: Holon[]; gone?: string[]; says?: string; into?: string };

export type Committed = { commit: string; ids: Record<string, string> };

export type Engine = {
  attach(key: string, store: Store, options?: { write?: boolean }): Promise<void>;
  read<R extends Read>(query: R): Promise<Answer<R>>;
  commit(change: Change): Promise<Committed>;
  onChange(listener: () => void): () => void;
};

const isHandle = (value: unknown): value is string => typeof value === "string" && value.startsWith("~");

// A holon with every handle in it given its id: its own, its types, and what it
// refers to. Nothing else in it is touched, so text may begin as it likes.
function withIds(holon: Holon, ids: ReadonlyMap<string, string>): Holon {
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

// What is wrong with one holon, held against the field and what lands beside it.
async function holonProblem(field: Field, holon: Holon, landing: ReadonlyMap<string, Holon>) {
  const holonIn = async (id: string) => landing.get(id) ?? (await holonOf(field, id));

  if (holon.mould) {
    const problem = mouldProblem(holon.mould);
    if (problem) return `its mould: ${problem}`;
  } else if (holon.instance.length === 0) {
    return "it is an instance of nothing";
  }

  const moulds: Mould[] = [];

  for (const type of holon.instance) {
    const mould = (await holonIn(type))?.mould;

    if (!mould) return `${type} is not a type in the field`;
    moulds.push(mould as Mould);
  }

  if (moulds.length) {
    const problem = bodyProblem(holon.body, moulds);
    if (problem) return problem;
  }

  for (const { id } of references(holon.body)) {
    if (!(await holonIn(id))) return `it references ${id}, which is not in the field`;
  }

  return undefined;
}

// What is wrong with a change, if anything: each holon must be sound, and nothing left
// anywhere in the field may point at what it takes out.
async function changeProblem(field: Field, holons: Holon[], gone: string[]) {
  const landing = new Map(holons.map((holon) => [holon.id, holon]));

  if (landing.size !== holons.length) return "one holon is changed twice in one commit";

  for (const id of [...landing.keys(), ...gone]) if (!isId(id)) return `${id} is not an id`;

  for (const holon of holons) {
    const problem = await holonProblem(field, holon, landing);
    if (problem) return `${holon.name ?? holon.id}: ${problem}`;
  }

  if (gone.length) {
    const going = new Set(gone);
    const known = [...(await field.everything()).known.values()].map(({ holon }) => holon);
    const staying = known.map((holon) => landing.get(holon.id) ?? holon);

    for (const holon of [...staying, ...holons]) {
      if (going.has(holon.id)) continue;

      const lost = [...references(holon.body).map(({ id }) => id), ...holon.instance].find((id) =>
        going.has(id),
      );
      if (lost) return `${holon.id} still refers to ${lost}, which would be gone`;
    }
  }

  return undefined;
}

// Where each holon of a commit is written, by the keys of the stores: where it is kept
// already; or, new, where the wholes of this commit that hold it are written; or, held
// by none, where the commit says, or the one store that may be written.
async function routeOf(field: Field, holons: Holon[], into: string | undefined) {
  const writable = field.stores.filter(({ write }) => write).map(({ key }) => key);
  const byId = new Map(holons.map((holon) => [holon.id, holon]));
  const kept = new Map<string, string[]>();

  for (const { id } of holons) {
    if (isHandle(id)) continue;

    const keepers = (await keepersOf(field, id)).map(({ key }) => key);
    if (keepers.length) kept.set(id, keepers);
  }

  // The holons of this commit that hold each new one, read through their types. A
  // handle is no id, so each stands in as one no store can hold while they are read.
  const handles = holons.filter(({ id }) => isHandle(id)).map(({ id }) => id);
  const standIn = new Map(handles.map((handle, i) => [handle, idAt(0, i)]));
  const handleOf = new Map([...standIn].map(([handle, id]) => [id, handle]));
  const holders = new Map<string, string[]>();

  for (const holon of holons) {
    const types = await Promise.all(
      holon.instance.map(
        async (type) => (byId.get(type) ?? (await holonOf(field, type)))?.mould as Mould | undefined,
      ),
    );

    for (const reference of references(withIds(holon, standIn).body, mouldOf(types))) {
      const id = handleOf.get(reference.id) ?? reference.id;
      if (reference.holds && byId.has(id) && !kept.has(id))
        holders.set(id, [...(holders.get(id) ?? []), holon.id]);
    }
  }

  const route = new Map<string, string[]>();

  function placeOf(id: string, seen: ReadonlySet<string>): string[] {
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

    if (into) return [into];
    if (writable.length === 1) return writable;

    throw new Error(
      `${byId.get(id)?.name ?? id} is held by nothing in this commit: say into which store it goes`,
    );
  }

  for (const { id } of holons) route.set(id, placeOf(id, new Set()));

  return { route, kept };
}

// Why a commit may not be written where it would go, if it may not: a holon kept, or
// one a commit sends, where the store is attached only to be read.
function refusalOf(
  targets: readonly Attached[],
  going: [string, string[]][],
  kept: ReadonlyMap<string, string[]>,
) {
  const readOnly = new Set(targets.filter(({ write }) => !write).map(({ key }) => key));
  if (!readOnly.size) return undefined;

  const [id, keys] = going.find(([, keys]) => keys.some((key) => readOnly.has(key)))!;
  const only = keys.filter((key) => readOnly.has(key)).join(" and ");

  return kept.has(id) || !isHandle(id)
    ? `${id} belongs to ${only}, which ${only.includes(" and ") ? "are" : "is"} only read`
    : `${id} cannot go into ${only}, which ${only.includes(" and ") ? "are" : "is"} only read`;
}

// Each handle given its id: one run, each store's share together, from past every
// moment the stores written have used.
function mintFor(targets: readonly Attached[], holons: Holon[], route: ReadonlyMap<string, string[]>) {
  const ids = new Map<string, string>();
  let next = targets
    .map(({ store }) => store.minter()())
    .sort()
    .at(-1)!;

  for (const { key } of targets) {
    for (const { id } of holons) {
      if (isHandle(id) && !ids.has(id) && route.get(id)!.includes(key)) {
        ids.set(id, next);
        next = nextId(next);
      }
    }
  }

  return ids;
}

// The stores whose head moved since they were opened, each as it now stands. One that
// cannot be read again is left as it was.
async function movedStores(targets: readonly Attached[]) {
  const now = await Promise.all(
    targets.map(async ({ key, store }) => {
      const reopened = await openStore(store.files, store.blocks).catch(() => store);
      return [key, reopened] as const;
    }),
  );

  return new Map(
    now.filter(([key, store]) => store.head !== targets.find((one) => one.key === key)!.store.head),
  );
}

export function startEngine(given: readonly Attached[] = []): Engine {
  let field = fieldOf(given);
  let turn: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  function inTurn<T>(task: () => Promise<T>) {
    const taken = turn.then(task);
    turn = taken.catch(() => undefined);
    return taken;
  }

  function become(next: Field) {
    field = next;
    for (const listener of listeners) listener();
  }

  // The field with some stores replaced by what they are now.
  const withStores = (now: ReadonlyMap<string, Store>) =>
    fieldOf(
      field.stores.map((attached) => ({ ...attached, store: now.get(attached.key) ?? attached.store })),
      field,
    );

  return {
    attach: (key, store, { write = false } = {}) =>
      inTurn(async () => {
        if (field.stores.some((attached) => attached.key === key))
          throw new Error(`a store is already attached as ${key}`);

        become(fieldOf([...field.stores, { key, store, write }], field));
      }),

    read: (query) => read(field, query),

    commit: ({ holons, gone = [], says = "A change", into }) =>
      inTurn(async () => {
        if (into && !field.stores.some(({ key }) => key === into))
          throw new Error(`nothing is attached as ${into}`);

        const { route, kept } = await routeOf(field, holons, into);
        const goneTo = new Map(
          await Promise.all(
            gone.map(async (id) => [id, (await keepersOf(field, id)).map(({ key }) => key)] as const),
          ),
        );

        const targets = field.stores.filter(({ key }) =>
          [...route.values(), ...goneTo.values()].some((keys) => keys.includes(key)),
        );
        if (!targets.length)
          throw new Error("the commit changes nothing: it writes no holon and takes nothing out");

        const refused = refusalOf(targets, [...route, ...goneTo], kept);
        if (refused) throw new Error(refused);

        const ids = mintFor(targets, holons, route);
        const landing = holons.map((holon) => withIds(holon, ids));
        const problem = await changeProblem(field, landing, gone);
        if (problem) throw new Error(problem);

        const given = targets.map(({ key, store }) => ({
          store,
          holons: landing.filter((_, i) => route.get(holons[i]!.id)!.includes(key)),
        }));

        try {
          const done = await act(given, { says, gone, born: [...ids.values()] });
          become(withStores(new Map(targets.map(({ key }, i) => [key, done.stores[i]!]))));

          return { commit: done.act, ids: Object.fromEntries(ids) };
        } catch (error) {
          // An act cut short may have moved some stores: those whose head moved are read
          // again as they now stand, and the field changes only if one did.
          const moved = await movedStores(targets);
          if (moved.size) become(withStores(moved));
          throw error;
        }
      }),

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
