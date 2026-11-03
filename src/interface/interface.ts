import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { HolonRead } from "../engine/engine.ts";
import { arrangement, mountsOf, place, readingOf, restyle, walk } from "./arrangement.ts";
import type { Kind, Settings, Target } from "./component.ts";
import type { Connection } from "./connection.ts";
import { drawing, type Call } from "./drawing.ts";
import { dismiss } from "./chrome.ts";
import { lay } from "./materials.ts";

// The interface draws the arrangement, the layout in the home, as the page's
// one full slot; the layout's component opens its mounts as panes, each a
// slot drawn by the component found for it, which opens slots for what it
// holds, drawn in turn. Nothing it holds lasts: it keeps the
// components it knows and what it is drawing now, and takes the reader's
// moves one at a time. What lasts, even where the reader stands, is in the
// field.
//
// A component is code, and code runs in the page with all it can reach, so
// only the components of the home and of glass's own store are run. Another
// store's components wait until what they draw can run apart.

const trusted = new Set(["home", "glass"]);

export async function mount(engine: Connection, root: HTMLElement) {
  let components: HolonRead[] = [];
  let arranged: HolonRead | undefined;
  let moves: Promise<unknown> = Promise.resolve();

  const kinds = await kindsOf(engine);
  const kindNamed = (id: Id): Kind | undefined =>
    id === kinds.face ? "face" : id === kinds.full ? "full" : undefined;

  // A layout's mount as a slot. The arrangement's mounts are where the
  // reader stands, so a move inside one moves that mount, and a change from
  // its chrome is kept in it; any other layout is only shown, and a move
  // inside it moves the slot that shows it.
  const paneOf = (layout: HolonRead, index: number, outer: Call): Omit<Call, "offered"> => {
    const each = mountsOf(layout)[index]!;
    const own = layout.id === arranged?.id;
    return {
      reads: readingOf(each),
      ...(each.kind && kindNamed(each.kind.$ref) ? { own: kindNamed(each.kind.$ref)! } : {}),
      settings: (each.settings ?? {}) as Settings,
      called: each.component?.$ref,
      place: own ? (to) => moveTo(index, to) : outer.place,
      why: `this pane is part of ${String(layout.body.title ?? "a layout")}, which is only shown here; your own arrangement is where changes go`,
      ...(own
        ? {
            keep: (change) =>
              inTurn(async () => {
                await restyle(engine, index, { ...change, kind: change.kind && kinds[change.kind] });
                await draw();
              }),
          }
        : {}),
    };
  };

  const drawn = drawing(engine, { components: () => components, kinds, paneOf });

  // Moves are taken one at a time, each from where the one before left.
  const inTurn = (move: () => Promise<void>) => {
    const taken = moves.then(move);
    moves = taken.catch((error) => console.error(error));
    return taken;
  };

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

  // The arrangement drawn whole, in the page's one root slot.
  const draw = async () => {
    arranged = await arrangement(engine);
    dismiss();
    // The page offers its one slot, and what lies beneath, a full view.
    const call: Call = {
      reads: { holon: arranged.id },
      offered: { kind: "full" },
      settings: { alone: true },
      place: (to) => moveTo(0, to),
      root: true,
      why: "the page always shows your arrangement whole",
    };
    await drawn.draw(root, call);
  };

  // A move commits the arrangement, and the browser's history holds the
  // home's commit after it.
  const moveTo = (index: number, to: Target) =>
    inTurn(async () => {
      if (!(await place(engine, index, to))) return;
      history.pushState({ commit: await engine.read({ head: "home" }) }, "");
      await draw();
    });

  const componentType = (await engine.read({ name: "component" })) as Id | null;
  if (!componentType) throw new Error("the field holds no component type");
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

  addEventListener(
    "popstate",
    (event: PopStateEvent) =>
      void inTurn(async () => {
        await walk(engine, (event.state as { commit?: Name | null } | null)?.commit ?? null);
        await draw();
      }),
  );
  if (!history.state) history.replaceState({ commit: await engine.read({ head: "home" }) }, "");
  await inTurn(draw);
}

// The kinds of slot the field names, by the words components use.
async function kindsOf(engine: Connection): Promise<Record<Kind, Id>> {
  const full = (await engine.read({ name: "full" })) as Id | null;
  const face = (await engine.read({ name: "face" })) as Id | null;
  if (!full || !face) throw new Error("the field does not name the kinds of slot, full and face");
  return { full, face };
}
