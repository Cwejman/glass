// The interface draws one mount, the root, as the page's one full slot, and what the
// mount gives is drawn by the component it calls, which opens slots for what it holds,
// drawn in turn. Nothing it holds lasts. The root is a holon in the home, the reader's
// own once they first write it, holding what is theirs: their favorites and settings.
//
// A move of the root is a new address, a step in the browser's own history, and a
// visit added to the reader's history in the field, which is only ever added to. Back
// and forward are only the address changing: nothing is written to go back.
//
// The page names the entry, and everything else is reached from it by reference: what
// it offers is what everything beneath it looks for, the functions, components, types
// and material glass ships. Names are looked up only within a whole that holds them.
//
// A component is code, and code runs in the page with all it can reach, so only the
// components the entry offers and those of the home are run.

import type { HolonRead } from "../engine/compat.ts";
import type { Holon } from "../integrations/glass/store.ts";
import { namesAsked } from "../language/names.ts";
import { print, type Names, type Route } from "../language/text.ts";
import { addressOf, expressionOf, namedAt, placeOf, samePlace, textOf, type Place } from "./address.ts";
import type { Made } from "./component.ts";
import type { Connection } from "./connection.ts";
import { drawing, type Options } from "./drawing.ts";

type Ref = { $ref: string };

const firstNamedInHome = async (engine: Connection, named: string) =>
  (await engine.read({ named, store: "home" }))[0];

// What a whole holds, read by reference.
async function heldBy(engine: Connection, whole: Ref | undefined) {
  const held = whole ? await engine.holon(whole.$ref) : null;
  const ids = ((held?.body.holds ?? []) as Ref[]).map(({ $ref }) => $ref);

  return (await Promise.all(ids.map((id) => engine.holon(id)))).filter((holon) => holon !== null);
}

// What a whole offers, and the home's own holons of the same type beside them.
async function offeredAndOwn(engine: Connection, whole: Ref | undefined) {
  const offered = await heldBy(engine, whole);
  const type = offered[0]?.instance[0];
  if (!type) return offered;

  const own = await Promise.all(
    (await engine.read({ instances: type, store: "home" })).map((id) => engine.holon(id)),
  );

  return [...offered, ...own.filter((holon) => holon !== null)];
}

// The functions an address is said by: those the entry offers, and the reader's own.
type Functions = { names: Names; or?: string; route?: string };

function functionsOf(functions: HolonRead[]): Functions {
  const named = (name: string) => functions.filter((fn) => fn.name === name).map(({ id }) => id);

  return {
    names: {
      functions: named,
      holons: () => [],
      isFunction: (id) => functions.some((fn) => fn.id === id),
      nameOf: (id) => functions.find((fn) => fn.id === id)?.name,
    },
    or: functions.find(({ body }) => body.native === "or")?.id,
    route: named("route")[0],
  };
}

// The material laid on the page, so everything drawn is made of what the field says.
function lay(material: HolonRead | null) {
  if (!material) return;

  const style = document.createElement("style");

  style.dataset.material = material.id;
  style.textContent = String(material.body.css ?? "");
  document.head.prepend(style);
}

// What the chassis attached, each store by what it is called here and where it comes from.
export type Attached = { key: string; from: string };

// Each store attached, kept in the home as an attachment: born the first time it is
// attached, and said again when where it comes from has moved.
async function keepAttached(engine: Connection, type: string | undefined, attached: Attached[]) {
  if (!type) return;

  const kept = await Promise.all(
    (await engine.read({ instances: type, store: "home" })).map((id) => engine.holon(id)),
  );
  const keptByKey = new Map(kept.flatMap((holon) => (holon ? [[holon.body.key, holon] as const] : [])));

  const holons = attached.flatMap((body, i) => {
    const was = keptByKey.get(body.key);

    if (!was) return [{ id: `~${i}`, instance: [type], name: body.key, body }];
    if (was.body.from === body.from) return [];

    return [{ id: was.id, instance: was.instance, name: was.name, body: { ...was.body, from: body.from } }];
  });

  if (holons.length) await engine.commit({ holons, says: "What is attached", into: "home" });
}

export async function mount(
  engine: Connection,
  page: HTMLElement,
  { entry, load, attached = [] }: { entry: string; load?: Options["load"]; attached?: Attached[] },
) {
  const found = await engine.holon(entry);
  if (!found) throw new Error(`the entry ${entry} is not in the field`);

  const entered: HolonRead = found;

  const offer = (entered.body.offer ?? {}) as Record<string, Ref | undefined>;
  const types = new Map((await heldBy(engine, offer.types)).map((type) => [type.name, type.id]));
  const typeNamed = (name: string) => types.get(name);

  await keepAttached(engine, typeNamed("attachment"), attached);

  const components = await offeredAndOwn(engine, offer.components);
  const functionsNow = async () => functionsOf(await offeredAndOwn(engine, offer.functions));

  if (!components.length) throw new Error("the entry offers no components");

  lay(offer.material ? await engine.holon(offer.material.$ref) : null);

  const historyType = typeNamed("history");
  const rootOf = async () => (await firstNamedInHome(engine, "root")) ?? entry;

  let drawnRoot = await rootOf();
  let place: Place | undefined;

  // Moves are taken one at a time, each from where the one before left.
  let moves: Promise<unknown> = Promise.resolve();

  function inTurn(move: () => Promise<void>) {
    const taken = moves.then(move);
    moves = taken.catch((error) => console.error(error));
    return taken;
  }

  // A visit added to the reader's history in the home, born with the first.
  async function visit(at: Place) {
    if (!historyType) return;

    const [kept] = await engine.read({ instances: historyType, store: "home" });
    const held = kept ? await engine.holon(kept) : null;

    const visits = [
      ...((held?.body.visits as unknown[] | undefined) ?? []),
      {
        at: new Date().toISOString(),
        looked: await lookedAt(at),
        ...(at.component ? { with: at.component.$ref } : {}),
      },
    ];

    await engine.commit({
      holons: [{ id: held?.id ?? "~history", instance: [historyType], name: "History", body: { visits } }],
      says: "A visit",
      into: "home",
    });
  }

  async function moveTo(next: Place) {
    if (samePlace(place, next)) return;

    place = next;
    history.pushState(null, "", await addressFor(next));

    await draw();
    scrollTo(0, 0);
    await visit(next);
  }

  // A holon may be written where it is the reader's: in the home, or the entry while
  // it is still the root, which the first write makes the reader's own.
  const may = (holon: HolonRead) => holon.store === "home" || (holon.id === entry && drawnRoot === entry);

  // A place that names the component the entry calls names none: it is the plain way to look.
  // A move to nowhere in particular is a move to the root.
  const move = (next: Place) =>
    inTurn(async () => {
      const plain = next.component?.$ref === entered.body.component?.$ref;
      const { component, ...where } = next;
      const somewhere = where.gathers || where.argument?.length;

      await moveTo(!somewhere ? atRoot() : component && !plain ? next : where);
    });

  // A write of the entry is the reader's first of their own, which makes them a root.
  // A second press behind the first finds that root there, and adds to it.
  const write = (holon: HolonRead, body: Holon["body"], made: Made[]) =>
    inTurn(async () => {
      const own = holon.store === "home" ? holon : await ownRoot();
      const offer = { ...own?.body.offer, ...body.offer };
      const { argument: _, ...kept } = body;

      await engine.commit({
        holons: [
          {
            id: own?.id ?? "~root",
            instance: holon.instance,
            name: own?.name ?? "root",
            body: { ...kept, ...(Object.keys(offer).length ? { offer } : {}) },
          },
          ...made,
        ],
        says: "The reader's own",
        into: "home",
      });

      if ((await rootOf()) !== drawnRoot) await draw();
    });

  async function ownRoot() {
    const id = await firstNamedInHome(engine, "root");
    return id ? engine.holon(id) : null;
  }

  const drawn = drawing(engine, { components, may, write, move, ...(load ? { load } : {}) });

  // The root drawn whole, in the page's one slot, which offers it a full view.
  async function draw() {
    drawnRoot = await rootOf();

    await drawn.draw(page, {
      reads: { holon: drawnRoot },
      offered: { kind: "full" },
      settings: { place, entry: entered.body },
    });
  }

  // Where the entry looks: the root, which the address says by saying nothing.
  function atRoot(): Place {
    return {
      ...(entered.body.gathers ? { gathers: entered.body.gathers } : {}),
      ...(entered.body.argument?.length ? { argument: entered.body.argument } : {}),
    };
  }

  // What a place says as text, as the reader's history keeps it.
  async function lookedAt(at: Place) {
    const { names, or } = await functionsNow();
    return print(expressionOf(at, or), names);
  }

  // The route down to one holon, the names from its store's level, where those names
  // find it alone; a holon on the way with no name of its own has none.
  async function routeTo(at: Place, route?: string): Promise<Route | undefined> {
    if (!route || at.argument?.length !== 1 || at.gathers) return undefined;

    const id = at.argument[0]!.$ref;
    const down = (await engine.read({ value: { call: { $ref: route }, with: [{ $ref: id }] } })) as
      | { $ref: string }[]
      | null;
    const holons = await Promise.all((down ?? []).map(({ $ref }) => engine.holon($ref)));
    if (!holons.length || holons.some((holon) => holon?.name === undefined)) return undefined;

    const found: Route = { store: holons[0]!.store, names: holons.map((holon) => holon!.name!) };
    const names = await namesAsked(engine.read, textOf({ route: found }));

    return names.holons(found).length === 1 ? found : undefined;
  }

  async function addressFor(at: Place) {
    if (samePlace(at, atRoot())) return location.pathname;

    const { names, or, route } = await functionsNow();
    return addressOf(location.pathname, at, { names, or, route: await routeTo(at, route) });
  }

  // The place the address names, or, where it names none that can be read, the root,
  // and the address is then made to say nothing.
  async function settle() {
    try {
      const named = namedAt(location.href);

      // A route's id is the holon's identity: where it still stands, the route is only how
      // the address read, and is said again as it stands now.
      const kept = named && "route" in named && named.id ? await engine.holon(named.id) : null;

      place = kept
        ? { argument: [{ $ref: kept.id }], ...(named!.component ? { component: named!.component } : {}) }
        : named
          ? placeOf(named, await namesAsked(engine.read, textOf(named)), (await functionsNow()).or)
          : undefined;

      // A route that led by its id, its names having moved, is said again as it stands now.
      if (place && named && "route" in named) history.replaceState(null, "", await addressFor(place));
    } catch (error) {
      console.error(error);
      place = undefined;
    }

    if (place) return;

    place = atRoot();
    history.replaceState(null, "", location.pathname);
  }

  addEventListener("popstate", () => void inTurn(async () => (await settle(), await draw())));

  await settle();
  await inTurn(draw);
}
