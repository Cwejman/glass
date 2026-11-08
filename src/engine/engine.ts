// The engine holds the stores it attaches and is the only way into them. Its home
// is the one store it writes; every store it pulls is read, never written. It takes
// attaches and commits one at a time, each making the next field from the one
// before, and tells whoever listens that the field has changed.
//
// A commit may bring holons into being under handles of its own, "~1" for one, and
// use them wherever an id goes. The engine gives them their ids as it lands, so
// whoever asks need not wait to refer to what it is making.

import { commit as commitTo, isId, type Holon, type Store } from "../store/store.ts";
import { fieldOf, holonOf, read, type Field } from "./field.ts";
import { bodyProblem, mouldProblem, type Mould } from "./moulds.ts";
import type { Answer, HolonRead, Read, Whole } from "./reads.ts";
import { references } from "./references.ts";

export type { HolonRead, Read, Whole };

export type Change = { holons: Holon[]; gone?: string[]; says?: string };

export type Committed = { commit: string; ids: Record<string, string> };

export type Engine = {
  attach(key: string, store: Store): Promise<void>;
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

// What is wrong with a change, if anything. It lands in the home, so nothing it
// writes or takes out may be a pulled store's; each holon must be sound; and nothing
// left in the home may point at what it takes out.
async function changeProblem(field: Field, home: Store, holons: Holon[], gone: string[]) {
  const landing = new Map(holons.map((holon) => [holon.id, holon]));

  if (landing.size !== holons.length) return "one holon is changed twice in one commit";

  for (const id of [...landing.keys(), ...gone]) {
    if (!isId(id)) return `${id} is not an id`;

    const owner = field.stores.find(({ store }) => store.mayHold(id));
    if (owner && owner.store !== home) return `${id} belongs to ${owner.key}, which is only read`;
  }

  for (const holon of holons) {
    const problem = await holonProblem(field, holon, landing);
    if (problem) return `${holon.name ?? holon.id}: ${problem}`;
  }

  if (gone.length) {
    const going = new Set(gone);
    const staying = [...(await home.all()).values()].map(({ version }) => landing.get(version.id) ?? version);

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

export function startEngine(homeStore: Store): Engine {
  let home = homeStore;
  let field = fieldOf([{ key: "home", store: home }]);
  let turn: Promise<unknown> = Promise.resolve();
  const listeners = new Set<() => void>();

  function inTurn<T>(act: () => Promise<T>) {
    const taken = turn.then(act);
    turn = taken.catch(() => undefined);
    return taken;
  }

  function become(next: Field) {
    field = next;
    for (const listener of listeners) listener();
  }

  return {
    attach: (key, store) =>
      inTurn(async () => {
        if (field.stores.some((attached) => attached.key === key))
          throw new Error(`a store is already attached as ${key}`);

        become(fieldOf([...field.stores, { key, store }], field));
      }),

    read: (query) => read(field, query),

    commit: ({ holons, gone = [], says = "A change in the home" }) =>
      inTurn(async () => {
        const mint = home.minter();
        const ids = new Map(holons.filter(({ id }) => isHandle(id)).map(({ id }) => [id, mint()]));
        const landing = holons.map((holon) => withIds(holon, ids));

        const problem = await changeProblem(field, home, landing, gone);
        if (problem) throw new Error(problem);

        const done = await commitTo(home, { holons: landing, gone, says });

        home = done.store;
        become(fieldOf([{ key: "home", store: home }, ...field.stores.slice(1)], field));

        return { commit: done.commit, ids: Object.fromEntries(ids) };
      }),

    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
