import { canonical, type Json } from "../store/canonical.ts";
import { newId, type Id } from "../store/id.ts";
import type { Body } from "../store/objects.ts";
import type { Expression, HolonRead } from "../engine/engine.ts";
import { parse, print } from "../engine/syntax.ts";
import type { Kind, Made } from "./component.ts";
import type { Connection } from "./connection.ts";
import { drawing } from "./drawing.ts";
import { lay } from "./materials.ts";

// The interface draws one mount, the root, as the page's one full slot, and
// what the mount gives is drawn by the component it calls, which opens
// slots for what it holds, drawn in turn. Nothing it holds lasts: it keeps
// the components it knows and what it is drawing now. The root is a holon
// in the home, the reader's own once they first write it, holding what is
// theirs: what it offers, as their favorites and settings.
//
// Where the reader looks is the page's address, the truth of it: an
// expression said as text, and the component it is looked at with, where
// one was chosen. The root is offered that place, and a move of the root
// is a new address, a step in the browser's own history, and a visit added
// to the reader's history in the field, which is only ever added to. Back
// and forward are only the address changing: nothing is written to go
// back. This is where the browser and the field meet, an integration, kept
// here until glass runs programs.
//
// A component is code, and code runs in the page with all it can reach, so
// only the components of the home and of glass's own store are run. Another
// store's components wait until what they draw can run apart.

const trusted = new Set(["home", "glass"]);

export async function mount(engine: Connection, root: HTMLElement) {
  let components: HolonRead[] = [];
  let moves: Promise<unknown> = Promise.resolve();
  let drawnRoot: Id | undefined;

  // Moves are taken one at a time, each from where the one before left.
  const inTurn = (move: () => Promise<void>) => {
    const taken = moves.then(move);
    moves = taken.catch((error) => console.error(error));
    return taken;
  };

  const kinds = await kindsOf(engine);
  const entry = (await engine.read({ name: "entry" })) as Id | null;
  if (!entry) throw new Error("the field has no entry to boot into");
  const componentType = (await engine.read({ name: "component" })) as Id | null;
  if (!componentType) throw new Error("the field holds no component type");
  const rootOf = async () => ((await engine.read({ name: "root" })) as Id | null) ?? entry;

  // The functions the field holds, by their ids and by their titles, as an
  // address says and reads them.
  const functionsNow = async () => {
    const type = (await engine.read({ name: "function" })) as Id | null;
    const ids = type ? ((await engine.read({ instances: type })) as Id[]) : [];
    const titles = new Map<Id, string>();
    let or: Id | undefined;
    for (const id of ids) {
      const body = (await engine.holon(id))?.body;
      titles.set(id, String(body?.title ?? id));
      if (body?.native === "or") or ??= id;
    }
    const byTitle = new Map<string, Id[]>();
    for (const [id, title] of titles) byTitle.set(title, [...(byTitle.get(title) ?? []), id]);
    return { titles, byTitle, or };
  };

  // A place: what the root gives, an expression or holons, and the
  // component it is looked at with, where one was chosen.
  type Place = { gathers?: Expression; argument?: { $ref: Id }[]; component?: { $ref: Id } };
  let place: Place | undefined;
  const sameWhere = (a: Place | undefined, b: Place) =>
    canonical([a?.gathers ?? null, a?.argument ?? null, a?.component ?? null] as Json) ===
    canonical([b.gathers ?? null, b.argument ?? null, b.component ?? null] as Json);

  // The place an address names, if it names one that can be read.
  const placeAt = async (address: string): Promise<Place | undefined> => {
    const query = new URL(address).searchParams;
    const looked = query.get("look");
    if (!looked) return undefined;
    try {
      const { byTitle, or } = await functionsNow();
      const expression = parse(looked, byTitle);
      const by = query.get("with");
      // Holons said one by one, alone or given together as either, are the
      // holons themselves, as a place of several is said.
      const holons =
        "$ref" in expression
          ? [expression]
          : "call" in expression &&
              expression.call.$ref === or &&
              expression.with?.every((each) => typeof each !== "string" && "$ref" in each)
            ? (expression.with as { $ref: Id }[])
            : undefined;
      return {
        ...(holons ? { argument: holons } : { gathers: expression }),
        ...(by ? { component: { $ref: by } } : {}),
      };
    } catch (error) {
      console.error(error);
      return undefined;
    }
  };
  // The text a place is said by, as an address carries it.
  const said = async ({ gathers, argument = [] }: Place) => {
    const { titles, or } = await functionsNow();
    if (gathers) return print(gathers, titles);
    if (argument.length === 1 || !or) return argument.map(({ $ref }) => `@${$ref}`)[0] ?? "";
    return print({ call: { $ref: or }, with: argument }, titles);
  };
  const addressOf = async (at: Place) => {
    const url = new URL(location.href);
    url.searchParams.set("look", await said(at));
    if (at.component) url.searchParams.set("with", at.component.$ref);
    else url.searchParams.delete("with");
    return url.href;
  };

  // A visit added to the reader's history in the home, born with the first.
  const visit = async (at: Place) => {
    const type = (await engine.read({ name: "history" })) as Id | null;
    if (!type) return;
    const kept = ((await engine.read({ instances: type })) as Id[])[0];
    const held = kept ? await engine.holon(kept) : null;
    const visits = [
      ...((held?.body.visits as Json[] | undefined) ?? []),
      {
        at: new Date().toISOString(),
        looked: await said(at),
        ...(at.component ? { with: at.component.$ref } : {}),
      },
    ];
    await engine.commit({
      holons: [
        {
          id: held?.store === "home" ? held.id : newId(),
          instance: [type],
          body: { title: "History", visits },
        },
      ],
    });
  };

  // A holon may be written where it is the reader's: in the home, or the
  // entry while it is still the root, which the reader's first move makes
  // their own. Once they have one, the entry is only shown.
  const may = (holon: HolonRead) => holon.store === "home" || (holon.id === entry && drawnRoot === entry);
  const write = (holon: HolonRead, body: Body, made: Made[]) =>
    inTurn(async () => {
      // A move of the root is where it looks: a new address, and a visit.
      if (holon.id === drawnRoot) {
        const { gathers, argument, component, ...rest } = body as Body & Place;
        const entered = await engine.holon(entry);
        const plain =
          component && component.$ref === (entered?.body.component as { $ref: Id } | undefined)?.$ref;
        const next: Place = {
          ...(gathers ? { gathers } : {}),
          ...(argument ? { argument } : {}),
          ...(component && !plain ? { component } : {}),
        };
        if ((gathers || argument) && !sameWhere(place, next)) {
          place = next;
          history.pushState(null, "", await addressOf(next));
          await visit(next);
          await draw();
          scrollTo(0, 0);
        }
        // What else changed, as what it offers, is written to the root.
        const { from: __, gathers: ___, argument: ____, component: _____, ...stands } = holon.body;
        if (canonical(rest as Json) === canonical(stands as Json) && made.length === 0) return;
        body = { ...(holon.body.component ? { component: holon.body.component } : {}), ...rest } as Body;
      }
      const { from: _, ...written } = body;
      // A write that waited behind the first move finds the entry no longer
      // the reader's to write.
      if (holon.store !== "home" && (await engine.read({ name: "root" }))) return;
      // What it brings into being is new: an id the field already holds is
      // not the component's to give again. Nor is it code: a component in the
      // home is run, so no component brings another into being.
      for (const { id, instance } of made) {
        if (await engine.holon(id)) throw new Error(`${id} is already in the field`);
        if (instance === componentType) throw new Error("a component brings no component into being");
      }
      const born = made.map(({ id, instance, body }) => ({ id, instance: [instance], body }));
      const id = holon.store === "home" ? holon.id : newId();
      await engine.commit({
        holons: [{ id, instance: holon.instance, body: written }, ...born],
        ...(id !== holon.id ? { names: { root: id } } : {}),
      });
    });

  const drawn = drawing(engine, { components: () => components, kinds, may, write });

  // The components in the field, each watched, so a new version of one is
  // drawn with from the next drawing on, without a reload.
  let watching: (() => void)[] = [];
  let ids: Id[] = [];
  const know = async (next: Id[]) => {
    ids = next;
    for (const stop of watching.splice(0)) stop();
    const read = await Promise.all(
      ids.map(async (id) => {
        const watched = await engine.subscribeHolon(
          id,
          () => void inTurn(async () => (await know(ids), await draw())),
        );
        watching.push(watched.close);
        return watched.value;
      }),
    );
    components = read.filter(
      (component) => component !== null && trusted.has(component.store),
    ) as HolonRead[];
  };

  // The root drawn whole, in the page's one slot, which offers it, and what
  // lies beneath, a full view.
  const draw = async () => {
    drawnRoot = await rootOf();
    await drawn.draw(root, {
      reads: { holon: drawnRoot },
      offered: { kind: "full", ...(place ? { place: place as never } : {}) },
      settings: {},
    });
  };

  const known = await engine.subscribe(
    { instances: componentType },
    (ids) =>
      void inTurn(async () => {
        await know(ids as Id[]);
        await draw();
      }),
  );
  await inTurn(() => know(known.value as Id[]));
  await lay(engine);

  // The first move names the reader's own root, which is then the one drawn.
  await engine.subscribe(
    { name: "root" },
    () =>
      void inTurn(async () => {
        if ((await rootOf()) !== drawnRoot) await draw();
      }),
  );

  // Back and forward are the address changing: the place it names is drawn.
  // Where an address names no place that can be read: where the entry
  // looks, which the address is made to say.
  const settle = async () => {
    place = await placeAt(location.href);
    if (place) return;
    const { gathers, argument } = ((await engine.holon(entry))?.body ?? {}) as Place;
    place = { ...(gathers ? { gathers } : {}), ...(argument?.length ? { argument } : {}) };
    history.replaceState(null, "", await addressOf(place));
  };
  addEventListener(
    "popstate",
    () =>
      void inTurn(async () => {
        await settle();
        await draw();
      }),
  );
  // The page opens where its address says.
  await settle();
  await inTurn(draw);
}

// The kinds of slot the field names, by the words components use.
async function kindsOf(engine: Connection): Promise<Record<Kind, Id>> {
  const full = (await engine.read({ name: "full" })) as Id | null;
  const face = (await engine.read({ name: "face" })) as Id | null;
  if (!full || !face) throw new Error("the field does not name the kinds of slot, full and face");
  return { full, face };
}
