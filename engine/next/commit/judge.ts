// Judging a change against the field as the stores stand: first that each head its at
// gives is one its store has had; then what the field knows of it, planned and held to
// the rules; then that no name it places in a whole is taken there; and, where it is
// strict, that nothing it touches moved since its at. Every problem is found at once,
// and none is thrown.

import type { Head, Holon, Problem, Store } from "../../../stores/store.ts";
import type { Heads } from "../engine.ts";
import { fieldOf, type Field } from "../read/field.ts";
import { isHandle, type Change } from "./change.ts";
import { references } from "../read/natives/holons.ts";
import { knownOf } from "./known.ts";
import { planOf, type Plan } from "./plan.ts";

// The stores a worker has mounted, by name, and whether it writes to each.
export type Mounted = ReadonlyMap<string, { store: Store; write: boolean }>;

export async function judge(change: Change, stores: Mounted, heads: Heads): Promise<Plan> {
  const now = fieldOf(stores, heads);
  const mounts = [...stores].map(([name, { write }]) => ({ name, write }));
  const [seen, plan] = await Promise.all([
    atProblems(change.at, stores, heads),
    knownOf(now, mounts, change).then((known) => planOf(known, change)),
  ]);

  const taken = await namesTaken(plan, now);
  const strict =
    change.strict && !seen.length ? await moved(change, now, fieldOf(stores, change.at), stores, heads) : [];
  return { ...plan, problems: [...seen, ...plan.problems, ...taken, ...strict] };
}

// The heads at gives that no mounted store has had.
async function atProblems(at: Heads, stores: Mounted, heads: Heads): Promise<Problem[]> {
  const found = await Promise.all(
    Object.entries(at).map(async ([name, head]): Promise<Problem | undefined> => {
      if (!head) return undefined;
      if (!stores.has(name)) return { rule: "at", says: `at gives a head of ${name}, which is not mounted` };

      const now = heads[name] as Head | null | undefined;
      const taken = now && (await stores.get(name)!.store.read(now, { act: head.act })).length;
      return taken ? undefined : { rule: "at", says: `at gives a head ${name} has never had` };
    }),
  );

  return found.filter((problem): problem is Problem => problem !== undefined);
}

// What the change touches that moved since its at: each holon it writes or takes out,
// read as it stood then and as it stands now. A store that keeps nothing of how it stood
// at its head in at, as a buffer keeps only the present, cannot say what moved since, so
// every holon it keeps is counted moved.
async function moved(change: Change, now: Field, then: Field, stores: Mounted, heads: Heads) {
  const ids = [...change.holons.map(({ id }) => id), ...(change.gone ?? [])].filter((id) => !isHandle(id));
  const unkept = await unkeptSince(change.at, stores, heads);
  const read = async (field: Field, id: string) => text((await field.holon(id))?.holon);
  const found = await Promise.all(
    ids.map(async (id): Promise<Problem[]> => {
      const store = (await now.keepers(id)).find((name) => unkept.has(name));
      if (store !== undefined)
        return [
          { rule: "strict", id, says: `${store} keeps only the present, so cannot tell what moved since` },
        ];

      return (await read(then, id)) === (await read(now, id))
        ? []
        : [{ rule: "strict", id, says: "it moved since the heads the change was made from" }];
    }),
  );

  return found.flat();
}

// The stores at gives an earlier head of that keep nothing of how they stood then.
async function unkeptSince(at: Heads, stores: Mounted, heads: Heads) {
  const unkept = await Promise.all(
    Object.entries(at).map(async ([name, head]) => {
      const now = heads[name] as Head | null | undefined;
      if (!head || !now || head.commit === now.commit) return [];

      const [taken] = new TextDecoder()
        .decode(await stores.get(name)!.store.read(now, { act: head.act }))
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { kept?: boolean });
      return taken?.kept === false ? [name] : [];
    }),
  );

  return new Set(unkept.flat());
}

// The names the change places in wholes that another holon of the whole already has: a
// whole and a name give one holon, so an address is never in doubt (12/61). A name is
// placed where a whole comes to hold a part it did not, or a part held is renamed; it
// is taken where another part of that whole, still held and still so named, has it, or
// another part placed there at once does.
async function namesTaken(plan: Plan, now: Field): Promise<Problem[]> {
  const landing = new Map(plan.shares.flatMap(({ holons }) => holons.map((holon) => [holon.id, holon])));
  const handles = new Map(Object.entries(plan.ids).map(([handle, id]) => [id, handle]));
  const said = (id: string) => handles.get(id) ?? id;
  const wasOf = async (id: string) => (await now.holon(id))?.holon;
  const nameOf = async (id: string) => (landing.has(id) ? landing.get(id)!.name : (await wasOf(id))?.name);
  const heldBy = (whole: Holon | undefined) =>
    new Set(whole ? references(whole.body).flatMap(({ id, holds }) => (holds ? [id] : [])) : []);

  // Each whole and the parts placed in it under a name.
  const placed = new Map<string, { whole: Holon | undefined; parts: [string, string][] }>();
  const place = (wholeId: string, whole: Holon | undefined, part: string, name: string) => {
    if (!placed.has(wholeId)) placed.set(wholeId, { whole, parts: [] });
    placed.get(wholeId)!.parts.push([part, name]);
  };

  for (const whole of landing.values()) {
    const before = heldBy(await wasOf(whole.id));
    for (const part of heldBy(whole)) {
      const name = await nameOf(part);
      const renamed = landing.has(part) && (await wasOf(part))?.name !== name;
      if (name !== undefined && (!before.has(part) || renamed)) place(whole.id, whole, part, name);
    }
  }

  // A part renamed is placed anew in every whole of the field holding it that the change
  // does not write.
  for (const holon of landing.values()) {
    const was = await wasOf(holon.id);
    if (!was || holon.name === undefined || was.name === holon.name) continue;
    for (const { e } of await now.facts({ a: "$holds", v: { $ref: holon.id } }))
      if (!landing.has(e)) place(e, await wasOf(e), holon.id, holon.name);
  }

  const problems: Problem[] = [];
  for (const [wholeId, { whole, parts }] of placed) {
    const held = heldBy(whole);
    for (const [i, [part, name]] of parts.entries()) {
      const twice = parts.findIndex(([other, otherName], j) => j < i && other !== part && otherName === name);
      const there = await now.address(wholeId, name);
      const takenThere =
        there !== null && there !== part && held.has(there) && (await nameOf(there)) === name;

      if (twice >= 0 || takenThere)
        problems.push({
          rule: "namesAreOne",
          id: said(part),
          says: `${said(wholeId)} already holds a holon named ${JSON.stringify(name)}`,
        });
    }
  }

  return problems;
}

const text = (holon: Holon | undefined) => (holon ? JSON.stringify(holon) : null);
