// What the field knows of a change, read all at once before anything is planned: which
// stores keep each holon it names, the holons it refers to, what refers to what goes,
// and the root of the store a holon nothing holds would go to. Every read a commit makes
// is here; what follows from them is planned purely, in plan.ts.
//
// A commit, in order: knownOf (here), planOf (plan.ts: residence, roots, mint, and the
// rules of rules.ts), write (write.ts, the one effect).

import { isId, type Holon } from "../../integrations/glass/store.ts";
import { holonOf, keepersOf, type Field } from "../field.ts";
import { isRoot, references } from "../moulds.ts";
import { anyLoose, looseStore, type Change, type Known } from "./plan.ts";

// What the field knows of a change, read all at once.
export async function knownOf(field: Field, change: Change): Promise<Known> {
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
