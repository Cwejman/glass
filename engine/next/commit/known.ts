// What the field knows of a change, read all at once before anything is planned: which
// stores keep each holon it names, the holons it refers to, what its uses apply and are
// given, what holds what it writes, what refers to what goes, the root of the store a
// holon nothing holds would go to, and the types each written store admits. Every read judging makes is here; what follows from them is pure, in
// plan.ts and rules.ts.

import { isId } from "../../../integrations/glass/store.ts";
import type { Holon } from "../../../stores/store.ts";
import type { Field } from "../read/field.ts";
import { inputOf, isUseType } from "../read/input.ts";
import { references } from "../read/natives/holons.ts";
import type { Change } from "./change.ts";
import { anyLoose, looseStore } from "./plan.ts";

export type Known = {
  // The stores mounted, in order, and whether each is written.
  stores: readonly { name: string; write: boolean }[];
  // The stores keeping each holon of the change now, and each that goes.
  kept: ReadonlyMap<string, readonly string[]>;
  // The holons of the field the change refers to, as types or by reference; and, for
  // each use it writes, the types of what it applies and is given, and the placeholders
  // of the function it applies, with their types.
  referred: ReadonlyMap<string, Holon>;
  // The holons of the field holding a holon the change writes.
  holding: readonly Holon[];
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
  const referred = await appliedBy(field, change.holons, await referredBy(field, change.holons));
  const into = looseStore({ stores }, change);
  const root = into && anyLoose(change.holons, { referred, kept }) ? await rootIn(field, into) : undefined;
  if (root) kept.set(root.id, await field.keepers(root.id));

  return {
    stores,
    kept,
    referred: root ? new Map([...referred, ...(await referredBy(field, [root]))]) : referred,
    holding: await holdingOf(
      field,
      [...kept.keys()].filter((id) => !gone.includes(id)),
    ),
    referring: await referringTo(field, gone),
    root,
    ...(await writtenRoots(field, stores)),
  };
}

// The holons of the field the holons given refer to, as their types or by reference.
async function referredBy(field: Field, holons: readonly Holon[]) {
  const own = new Set(holons.map(({ id }) => id));
  const ids = holons.flatMap((holon) => [...holon.instance, ...references(holon.body).map(({ id }) => id)]);

  return holonsOf(
    field,
    ids.filter((id) => !own.has(id)),
  );
}

// What judging the change's uses reads beyond what it refers to: the types of what each
// use applies and is given, and the placeholders of each function applied, with theirs.
async function appliedBy(field: Field, holons: readonly Holon[], referred: ReadonlyMap<string, Holon>) {
  const found = new Map(referred);
  const own = new Map(holons.map((holon) => [holon.id, holon]));
  const holonIn = (id: string) => own.get(id) ?? found.get(id);
  const ask = async (ids: string[]) => {
    for (const [id, holon] of await holonsOf(
      field,
      ids.filter((id) => !holonIn(id)),
    ))
      found.set(id, holon);
  };

  const uses = holons.filter(({ instance }) => instance.some((type) => isUse(holonIn(type))));
  const reached = uses.flatMap(({ body }) => references(body).flatMap(({ id }) => holonIn(id) ?? []));
  const placeholders = (holon: Holon) => (inputOf(holon) ?? []).map(({ $ref }) => $ref);

  await ask(reached.flatMap((holon) => [...holon.instance, ...placeholders(holon)]));
  await ask(reached.flatMap(placeholders).flatMap((id) => holonIn(id)?.instance ?? []));
  return found;
}

const isUse = (type: Holon | undefined) => Boolean(type && isUseType(type));

// The holons of the field holding those given.
async function holdingOf(field: Field, ids: readonly string[]) {
  const facts = (await Promise.all(ids.map((id) => field.facts({ a: "$holds", v: { $ref: id } })))).flat();
  return [
    ...(
      await holonsOf(
        field,
        facts.map(({ e }) => e),
      )
    ).values(),
  ];
}

// The holons of the field with these ids, each once, those it has.
async function holonsOf(field: Field, ids: readonly string[]) {
  const found = await Promise.all(
    [...new Set(ids)].filter(isId).map(async (id) => [id, (await field.holon(id))?.holon] as const),
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
