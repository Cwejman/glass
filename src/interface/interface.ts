import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { HolonRead } from "../engine/engine.ts";
import { arrangement, mountsOf, place, readingOf, restyle, walk } from "./arrangement.ts";
import type { Kind, Target } from "./component.ts";
import type { Connection } from "./connection.ts";
import { drawing, type Call } from "./drawing.ts";
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
  const kindNamed = (id: Id | undefined): Kind => (id === kinds.face ? "face" : "full");

  // A layout's mount as a slot. The arrangement's mounts are where the
  // reader stands, so a move inside one moves that mount, and a change from
  // its chrome is kept in it; any other layout is only shown, and a move
  // inside it moves the slot that shows it.
  const paneOf = (layout: HolonRead, index: number, outer: Call): Call => {
    const each = mountsOf(layout)[index]!;
    const own = layout.id === arranged?.id;
    return {
      reads: readingOf(each),
      kind: kindNamed(each.kind?.$ref),
      with: null,
      called: each.component?.$ref,
      place: own ? (to) => moveTo(index, to) : outer.place,
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

  const know = async (ids: Id[]) => {
    const read = await Promise.all(ids.map((id) => engine.holon(id)));
    components = read.filter(
      (component) => component !== null && trusted.has(component.store),
    ) as HolonRead[];
  };

  // The arrangement drawn whole, in the page's one root slot.
  const draw = async () => {
    arranged = await arrangement(engine);
    drawn.close(root);
    const call: Call = {
      reads: { holon: arranged.id },
      kind: "full",
      with: null,
      place: (to) => moveTo(0, to),
    };
    await drawn.draw(root, call);
  };

  // A move commits the arrangement, and the browser's history holds the
  // home's commit after it.
  const moveTo = (index: number, to: Target) =>
    inTurn(async () => {
      if (!(await place(engine, index, to))) return;
      history.pushState({ commit: await engine.read({ head: "home" }) }, "");
      scrollTo(0, 0);
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
  await know(known.value as Id[]);
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
