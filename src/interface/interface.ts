import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { HolonRead } from "../engine/engine.ts";
import { arrangement, mountsOf, place, readingOf, walk } from "./arrangement.ts";
import type { Target } from "./component.ts";
import type { Connection } from "./connection.ts";
import { drawing } from "./drawing.ts";
import { lay } from "./materials.ts";

// The interface mounts what the arrangement names, and each component
// encloses what it is given and opens space in it, where what it holds is
// drawn in turn by the component whose type matches. Nothing it holds lasts:
// it keeps the components it knows and what it is drawing now, and takes
// the reader's moves one at a time. What lasts, even where the reader
// stands, is in the field.

export async function mount(engine: Connection, root: HTMLElement) {
  let components: HolonRead[] = [];
  let moves: Promise<unknown> = Promise.resolve();
  const drawn = drawing(engine, () => components);

  // Moves are taken one at a time, each from where the one before left.
  const inTurn = (move: () => Promise<void>) => {
    const taken = moves.then(move);
    moves = taken.catch((error) => console.error(error));
    return taken;
  };

  const know = async (ids: Id[]) => {
    components = (await Promise.all(ids.map((id) => engine.holon(id)))).filter(
      (component) => component !== null,
    );
  };

  const draw = async () => {
    for (const host of root.children) drawn.close(host as HTMLElement);
    root.replaceChildren(
      ...mountsOf(await arrangement(engine)).map((each, index) => {
        const host = document.createElement("div");
        host.className = "mount";
        const call = {
          reads: readingOf(each),
          draws: "whole",
          given: null,
          place: (to: Target) => moveTo(index, to),
          called: each.component?.$ref,
        };
        void drawn.draw(host, call);
        return host;
      }),
    );
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
