import { newId, type Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { Body } from "../store/objects.ts";
import type { HolonRead } from "../engine/engine.ts";
import type { Kind } from "./component.ts";
import type { Connection } from "./connection.ts";
import { drawing } from "./drawing.ts";
import { lay } from "./materials.ts";

// The interface draws one mount, the root, as the page's one full slot, and
// what the mount gives is drawn by the component it calls, which opens
// slots for what it holds, drawn in turn. Nothing it holds lasts: it keeps
// the components it knows and what it is drawing now. What lasts, even what
// the reader looks at, is in the field: the root is a holon in the home,
// the reader's own once they first move, and every move a new version of
// it, so its versions are the reader's history.
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
  const rootOf = async () => ((await engine.read({ name: "root" })) as Id | null) ?? entry;

  // A holon may be written where it is the reader's: in the home, or the
  // entry while it is still the root, which the reader's first move makes
  // their own. Once they have one, the entry is only shown.
  const may = (holon: HolonRead) => holon.store === "home" || (holon.id === entry && drawnRoot === entry);
  const write = (holon: HolonRead, body: Body) =>
    inTurn(async () => {
      const { from: _, ...written } = body;
      // A write that waited behind the first move finds the entry no longer
      // the reader's to write.
      if (holon.store !== "home" && (await engine.read({ name: "root" }))) return;
      if (holon.store === "home")
        await engine.commit({ holons: [{ id: holon.id, instance: holon.instance, body: written }] });
      else {
        const id = newId();
        await engine.commit({
          holons: [{ id, instance: holon.instance, body: written }],
          names: { root: id },
        });
      }
      // A move of the root is a step in the reader's history, and a new place
      // to look at, seen from its top.
      if (holon.id !== drawnRoot) return;
      history.pushState({ commit: await engine.read({ head: "home" }) }, "");
      scrollTo(0, 0);
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
    await drawn.draw(root, { reads: { holon: drawnRoot }, offered: { kind: "full" }, settings: {} });
  };

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

  // The first move names the reader's own root, which is then the one drawn.
  await engine.subscribe(
    { name: "root" },
    () =>
      void inTurn(async () => {
        if ((await rootOf()) !== drawnRoot) await draw();
      }),
  );

  // The browser's back and forward walk the root's versions: the root as it
  // stood at a commit of the home is written again, so history only ever
  // grows. Before the reader's first move it stood as the entry.
  addEventListener(
    "popstate",
    (event: PopStateEvent) =>
      void inTurn(async () => {
        const commit = (event.state as { commit?: Name | null } | null)?.commit ?? null;
        const id = await rootOf();
        const now = await engine.holon(id);
        const then = (commit && (await engine.holon(id, commit))) || (await engine.holon(entry));
        if (!now || !then || now.store !== "home") return;
        const { from: _, ...body } = then.body;
        await engine.commit({ holons: [{ id, instance: now.instance, body }] });
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
