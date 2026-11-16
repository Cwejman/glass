// What the field knows of a change, read all at once before anything is planned: which
// stores keep each holon it names, the holons it refers to, what refers to what goes,
// the root of the store a holon nothing holds would go to, and the types each written
// store admits. Every read judging makes is here; what follows from them is pure, in
// plan.ts and rules.ts.

import { isId } from "../../../integrations/glass/store.ts";
import type { Holon } from "../../../stores/store.ts";
import type { Field } from "../read/field.ts";
import { references } from "../read/natives/holons.ts";
import type { Change } from "./change.ts";
import { anyLoose, looseStore } from "./plan.ts";

export type Known = {
  // The stores mounted, in order, and whether each is written.
  stores: readonly { name: string; write: boolean }[];
  // The stores keeping each holon of the change now, and each that goes.
  kept: ReadonlyMap<string, readonly string[]>;
  // The holons of the field the change refers to, as types or by reference.
  referred: ReadonlyMap<string, Holon>;
  // The holons of the field that refer to what goes.
  referring: readonly Holon[];
  // The root of the store a holon nothing holds would go to, where one would.
  root?: Holon;
  // The types each written store admits, where its shape names any.
  admits: ReadonlyMap<string, ReadonlySet<string>>;
  // The id of each written store's root, where it has one; a commit names the stores it
  // touches by these.
  roots: ReadonlyMap<string, string>;
};

export async function knownOf(field: Field, stores: Known["stores"], change: Change): Promise<Known> {
  const gone = change.gone ?? [];
  const keepers = async (ids: readonly string[]) =>
    Promise.all(ids.map(async (id) => [id, await field.keepers(id)] as const));

  const kept = new Map(
    (await keepers([...change.holons.map(({ id }) => id).filter(isId), ...gone])).filter(
      ([, names]) => names.length,
    ),
  );
  const referred = await referredBy(field, change.holons);
  const into = looseStore({ stores }, change);
  const root = into && anyLoose(change.holons, { referred, kept }) ? await rootIn(field, into) : undefined;
  if (root) kept.set(root.id, await field.keepers(root.id));

  return {
    stores,
    kept,
    referred: root ? new Map([...referred, ...(await referredBy(field, [root]))]) : referred,
    referring: await referringTo(field, gone),
    root,
    ...(await writtenRoots(field, stores)),
  };
}

// The holons of the field the holons given refer to, as their types or by reference.
async function referredBy(field: Field, holons: readonly Holon[]) {
  const own = new Set(holons.map(({ id }) => id));
  const ids = new Set(
    holons.flatMap((holon) => [...holon.instance, ...references(holon.body).map(({ id }) => id)]),
  );
  const found = await Promise.all(
    [...ids]
      .filter((id) => isId(id) && !own.has(id))
      .map(async (id) => [id, (await field.holon(id))?.holon] as const),
  );

  return new Map(found.flatMap(([id, holon]) => (holon ? [[id, holon] as const] : [])));
}

// The holons of the field that refer to what goes, by a reference or as its instances.
async function referringTo(field: Field, gone: readonly string[]) {
  const facts = (await Promise.all(gone.map((id) => field.facts({ v: { $ref: id } })))).flat();
  const from = [...new Set(facts.map(({ e }) => e))];
  const holons = await Promise.all(from.map((id) => field.holon(id)));

  return holons.flatMap((kept) => (kept ? [kept.holon] : []));
}

// A store's root: its holon of the type named store, a type with a mould.
async function rootIn(field: Field, name: string) {
  const types = await field.facts({ a: "name", v: "store" });
  const typed = await Promise.all(types.map(async ({ e }) => (await field.holon(e))?.holon));
  const instances = (
    await Promise.all(
      typed.flatMap((type) => (type?.mould ? [field.facts({ a: "instance", v: { $ref: type.id } })] : [])),
    )
  ).flat();

  for (const { e } of instances)
    if ((await field.keepers(e)).includes(name)) return (await field.holon(e))?.holon;

  return undefined;
}

// Each written store's root, and the types it admits: those its root's shape names,
// where it names any.
async function writtenRoots(field: Field, stores: Known["stores"]) {
  const written = await Promise.all(
    stores
      .filter(({ write }) => write)
      .map(async ({ name }) => {
        const root = await rootIn(field, name);
        const shape = root?.body.shape as { $ref?: string } | undefined;
        const admits = shape?.$ref
          ? ((await field.holon(shape.$ref))?.holon.body.admits as unknown[])
          : undefined;
        const types = (admits ?? []).flatMap((each) =>
          typeof (each as { $ref?: unknown })?.$ref === "string" ? [(each as { $ref: string }).$ref] : [],
        );
        return { name, root: root?.id, types: new Set(types) };
      }),
  );

  return {
    admits: new Map(
      written.filter(({ types }) => types.size).map(({ name, types }) => [name, types] as const),
    ),
    roots: new Map(written.flatMap(({ name, root }) => (root ? [[name, root] as const] : []))),
  };
}
