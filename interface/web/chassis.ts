// The chassis on the web: it subscribes once to the page's root read and draws what it
// gives. A drawing names the component that draws it, and its realization here is found
// by that component's id, never by a name; a value that names none, or a component with
// no realization here, is drawn by the component found for it by type (find.ts).
//
// A realization makes a node from what its component was given, and updates it when a
// new answer gives it something else, so what is drawn stays in place as answers come:
// the same component at the same place, the uses it was reached through and its index
// among the drawings beside it, is updated, never made again. A realization draws the
// values it holds through its space, all of them at once in a redraw, and the drawings
// a redraw no longer draws are let go.
//
// A realization may also propose a value where it stands: the way back (back.ts) walks
// it through the root read to a change, or to null where there is none, and the
// realization commits the change, or shows it cannot be edited.

import type { Change } from "../../engine/next/commit/change.ts";
import type { Answer, Committed, Engine, Read } from "../../engine/next/engine.ts";
import { after, waits } from "../../engine/next/read/maybe.ts";
import { isRecord, type Ref, type Value } from "../../engine/next/read/values.ts";
import { proposing } from "./carried.ts";
import type { Find } from "./find.ts";

// What a realization makes: its node, how it takes what it is given next, and how it
// lets go of what it holds, a subscription for one.
export type Drawn = { node: Node; update(given: Value[]): void; dispose?(): void };

export type Realization = (given: Value[], space: Space) => Drawn;

// Where a drawing stands: the uses walked to it from the root, and its index among the
// drawings beside it; and, for a value proposed there, which of what it was given.
export type Place = { at: readonly string[]; index?: number; arg?: number };

// What a realization draws with: its place; any value drawn within it, at an index; the
// work of drawing, after which what it did not draw is let go; the engine's reads; the
// change a value proposed at a place would make, or null; and committing a change.
export type Space = {
  place: Place;
  draw(value: Value, index?: number): Node;
  redraw(work: () => void): void;
  read(read: Read): Promise<Answer>;
  subscribe(read: Read, listener: (answer: Answer) => void): Promise<() => void>;
  propose(place: Place, value: Value): Promise<Change | null>;
  commit(change: Change): Promise<Committed>;
};

export type Drawer = {
  engine: Pick<Engine, "read" | "subscribe" | "commit">;
  realized: ReadonlyMap<string, Realization>;
  find: Find;
};

// A drawing as it leaves the engine: the component it names, or none, what it was given,
// and where it stands; or, where what it is given failed, the problem, said in its place.
export type Drawing = { $draw: Ref | null; given: Value[]; at: string[]; problem?: string };

export const isDrawing = (value: unknown): value is Drawing =>
  isRecord(value) && "$draw" in value && Array.isArray(value.given) && Array.isArray(value.at);

// Draws what the root read gives into the element, again whenever it changes, until the
// function returned is called.
export async function draw(into: Element, root: Read, given: Drawer): Promise<() => void> {
  const drawer = { ...given, root };
  const top = spaceAt({ at: [] }, drawer);
  const unsubscribe = await drawer.engine.subscribe(root, (answer) =>
    top.redraw(() => arrange(into, ["value" in answer ? top.draw(answer.value) : note(answer.problem)])),
  );

  return () => {
    unsubscribe();
    top.dispose();
  };
}

type Kept = Space & { dispose(): void };

// A drawer, and the root read it draws, which every way back is walked through.
type Rooted = Drawer & { root: Read };

function spaceAt(place: Place, drawer: Rooted): Kept {
  const hosts = new Map<number, Host>();
  let drawn: Set<number> | undefined;

  // Work that draws, and after it every drawing it did not draw let go. Work begun
  // within such work is part of it.
  function redraw(work: () => void) {
    if (drawn) return work();

    drawn = new Set();
    try {
      work();
    } finally {
      for (const [index, host] of hosts)
        if (!drawn.has(index)) {
          host.dispose();
          hosts.delete(index);
        }
      drawn = undefined;
    }
  }

  function draw(value: Value, index = 0) {
    drawn?.add(index);
    if (!hosts.has(index)) hosts.set(index, hostAt({ at: place.at, index }, drawer));
    const host = hosts.get(index)!;
    host.show(value);
    return host.node;
  }

  return {
    place,
    draw,
    redraw,
    read: (read) => drawer.engine.read(read),
    subscribe: (read, listener) => drawer.engine.subscribe(read, listener),
    async propose({ at, arg = 0 }, value) {
      const answer = await drawer.engine.read(proposing(drawer.root, at, arg, value));
      if (!("value" in answer)) throw new Error(answer.problem);
      return answer.value as unknown as Change | null;
    },
    commit: (change) => drawer.engine.commit(change),
    dispose() {
      for (const host of hosts.values()) host.dispose();
      hosts.clear();
    },
  };
}

type Host = { node: Element; show(value: Value): void; dispose(): void };

// One place a drawing stands, and what is drawn there now: updated where the same
// component draws at the same place, else made anew. Where finding a component waits on
// the engine, an older value found later never lands over a newer one.
function hostAt(place: Place, drawer: Rooted): Host {
  const node = document.createElement("div");
  node.className = "drawn";
  let now: { component: string; at: string; drawn: Drawn; space: Kept } | undefined;
  let turn = 0;

  const letGo = () => {
    now?.drawn.dispose?.();
    now?.space.dispose();
    now = undefined;
  };

  function show(value: Value) {
    const mine = ++turn;
    const fail = (problem: unknown) => {
      if (mine !== turn) return;
      letGo();
      node.replaceChildren(note(problem instanceof Error ? problem.message : String(problem)));
    };

    try {
      const shown = after(componentOf(value, place, drawer), ({ component, given, at }) => {
        if (mine !== turn) return;
        const where = at.join("/");
        if (now && now.component === component && now.at === where) {
          return now.drawn.update(given);
        }

        letGo();
        const realization = drawer.realized.get(component);
        if (!realization) throw new Error(`the component ${component} has no realization here`);
        const space = spaceAt({ at, index: place.index }, drawer);
        const drawn = realization(given, space);
        now = { component, at: where, drawn, space };
        node.replaceChildren(drawn.node);
      });
      if (waits(shown)) shown.catch(fail);
    } catch (problem) {
      fail(problem);
    }
  }

  return {
    node,
    show,
    dispose() {
      turn++;
      letGo();
    },
  };
}

// The component that draws a value, what it is given, and where it stands: the one a
// drawing names, where it is realized here, else the one found for what it was given.
function componentOf(value: Value, place: Place, { realized, find }: Drawer) {
  const drawing = isDrawing(value) ? value : undefined;
  if (drawing?.problem !== undefined) throw new Error(drawing.problem);
  const given = drawing ? drawing.given : [value];
  const at = drawing ? drawing.at : place.at;
  const named = drawing?.$draw?.$ref;

  if (named && realized.has(named)) return { component: named, given, at };
  return after(find(given[0] ?? null), (component) => ({ component, given, at }));
}

// The children of a node made these, touched only where they differ, so a node kept in
// place keeps its focus and its selection.
export function arrange(parent: Element, nodes: Node[]) {
  const now = [...parent.childNodes];
  if (now.length === nodes.length && now.every((node, i) => node === nodes[i])) return;
  parent.replaceChildren(...nodes);
}

// A line said in place of what could not be drawn.
export function note(text: string): Node {
  const said = document.createElement("p");
  said.className = "note";
  said.textContent = text;
  return said;
}
