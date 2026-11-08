// The interface draws one mount, the root, as the page's one full slot, and what the
// mount gives is drawn by the component it calls, which opens slots for what it holds,
// drawn in turn. Nothing it holds lasts. The root is a holon in the home, the reader's
// own once they first write it, holding what is theirs: their favorites and settings.
//
// A move of the root is a new address, a step in the browser's own history, and a
// visit added to the reader's history in the field, which is only ever added to. Back
// and forward are only the address changing: nothing is written to go back.
//
// A component is code, and code runs in the page with all it can reach, so only the
// components of glass's own store and of the home are run.

import type { HolonRead } from "../engine/reads.ts";
import type { Holon } from "../store/store.ts";
import { addressOf, placeAt, said, samePlace, type Place, type Titles } from "./address.ts";
import { ownStores, type Made } from "./component.ts";
import type { Connection } from "./connection.ts";
import { drawing, type Options } from "./drawing.ts";

const firstNamed = async (engine: Connection, named: string, store = "glass") =>
  (await engine.read({ named, store }))[0];

async function holonsOfType(engine: Connection, type: string) {
  const ids = (await Promise.all(ownStores.map((store) => engine.read({ instances: type, store })))).flat();
  const holons = await Promise.all(ids.map((id) => engine.holon(id)));

  return holons.filter((holon) => holon !== null);
}

async function functionsNow(engine: Connection, type: string): Promise<Titles> {
  const functions = await holonsOfType(engine, type);
  const titles = new Map(functions.map(({ id, name }) => [id, name ?? id]));
  const byTitle = new Map<string, string[]>();

  for (const [id, title] of titles) byTitle.set(title, [...(byTitle.get(title) ?? []), id]);

  return { titles, byTitle, or: functions.find(({ body }) => body.native === "or")?.id };
}

// Every material laid on the page, so everything drawn is made of what the field says.
async function layMaterials(engine: Connection, type: string) {
  for (const material of await holonsOfType(engine, type)) {
    const style = document.createElement("style");

    style.dataset.material = material.id;
    style.textContent = String(material.body.css ?? "");
    document.head.prepend(style);
  }
}

export async function mount(engine: Connection, page: HTMLElement, load?: Options["load"]) {
  const [entry, componentType, functionType, materialType, historyType] = await Promise.all(
    ["entry", "component", "function", "material", "history"].map((name) => firstNamed(engine, name)),
  );

  if (!entry || !componentType || !functionType)
    throw new Error("the glass store holds no entry, components or functions");

  const entered = (await engine.holon(entry))!;
  const components = await holonsOfType(engine, componentType);

  if (materialType) await layMaterials(engine, materialType);

  const rootOf = async () => (await firstNamed(engine, "root", "home")) ?? entry;

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
        looked: said(at, await functionsNow(engine, functionType!)),
        ...(at.component ? { with: at.component.$ref } : {}),
      },
    ];

    await engine.commit({
      holons: [{ id: held?.id ?? "~history", instance: [historyType], name: "History", body: { visits } }],
      says: "A visit",
    });
  }

  async function moveTo(next: Place) {
    if (samePlace(place, next)) return;

    place = next;
    history.pushState(
      null,
      "",
      addressOf(location.pathname, next, await functionsNow(engine, functionType!)),
    );

    await draw();
    scrollTo(0, 0);
    await visit(next);
  }

  // A holon may be written where it is the reader's: in the home, or the entry while
  // it is still the root, which the first write makes the reader's own.
  const may = (holon: HolonRead) => holon.store === "home" || (holon.id === entry && drawnRoot === entry);

  // A place that names the component the entry calls names none: it is the plain way to look.
  const move = (next: Place) =>
    inTurn(async () => {
      const plain = next.component?.$ref === entered.body.component?.$ref;
      const { component, ...where } = next;

      await moveTo(component && !plain ? next : where);
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
      });

      if ((await rootOf()) !== drawnRoot) await draw();
    });

  async function ownRoot() {
    const id = await firstNamed(engine, "root", "home");
    return id ? engine.holon(id) : null;
  }

  const drawn = drawing(engine, { components, may, write, move, ...(load ? { load } : {}) });

  // The root drawn whole, in the page's one slot, which offers it a full view.
  async function draw() {
    drawnRoot = await rootOf();

    await drawn.draw(page, { reads: { holon: drawnRoot }, offered: { kind: "full" }, settings: { place } });
  }

  // The place the address names, or, where it names none that can be read, where the
  // entry looks, which the address is then made to say.
  async function settle() {
    const functions = await functionsNow(engine, functionType!);

    try {
      place = placeAt(location.href, functions);
    } catch (error) {
      console.error(error);
      place = undefined;
    }

    if (place) return;

    place = {
      ...(entered.body.gathers ? { gathers: entered.body.gathers } : {}),
      ...(entered.body.argument?.length ? { argument: entered.body.argument } : {}),
    };
    history.replaceState(null, "", addressOf(location.pathname, place, functions));
  }

  addEventListener("popstate", () => void inTurn(async () => (await settle(), await draw())));

  await settle();
  await inTurn(draw);
}
