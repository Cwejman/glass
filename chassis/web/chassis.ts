// The chassis on the web: it subscribes once to the page's root read and draws what it
// gives. A drawing names the component that draws it, and its realization here is found
// by that component's id, never by a name; a value that names none, or a component with
// no realization here, is drawn by the component found for it by type (find.ts).
//
// What finding picks for a use that names no component is written into the use, as its
// fn, where the use's store takes the change; where it does not, as in a store mounted
// read-only, or a use the read carries, it is found again each time. Where several could
// draw it, the component it is given for choosing is drawn in its place, and the person's
// pick is written the same way, or held for the page where it cannot be.
//
// The chassis names no component of its own: whoever starts it gives it the components
// realized here, what each is called, and the one that chooses.
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
// realization commits the change, or shows it cannot be edited. One drawn as an item of
// another may propose its own removal: the drawing around it is proposed what it was
// given first without that item.

import type { Change } from "../../engine/commit/change.ts";
import type { Answer, Committed, Engine, Read } from "../../engine/engine.ts";
import { after, waits } from "../../engine/read/maybe.ts";
import { isHandle } from "../../engine/commit/change.ts";
import { isRecord, ref, type Ref, type Value } from "../../engine/read/values.ts";
import { applying, asHolon, proposing, type Glass } from "../../language/shipped.ts";
import { finder, type Find } from "./find.ts";

// What a realization makes: its node, how it takes what it is given next, and how it
// lets go of what it holds, a subscription for one.
export type Drawn = { node: Node; update(given: Value[]): void; dispose?(): void };

export type Realization = (given: Value[], space: Space) => Drawn;

// Where a drawing stands: the uses walked to it from the root, and its index among the
// drawings beside it; and, for a value proposed there, which of what it was given.
export type Place = { at: readonly string[]; index?: number; arg?: number };

// Proposed in place of a value, the item proposing it taken out of the drawing around it.
export const removed = Object.freeze({ removed: true });

// What a realization draws with: its place; what glass ships, by id; any value drawn
// within it, at an index; the work of drawing, after which what it did not draw is let
// go; the engine's reads; the change a value proposed at a place would make, or null;
// committing a change; and, where a component is to be chosen for what is drawn here,
// the one chosen.
export type Space = {
  place: Place;
  glass: Glass;
  draw(value: Value, index?: number): Node;
  redraw(work: () => void): void;
  read(read: Read): Promise<Answer>;
  subscribe(read: Read, listener: (answer: Answer) => void): Promise<() => void>;
  propose(place: Place, value: Value | typeof removed): Promise<Change | null>;
  commit(change: Change): Promise<Committed>;
  pick(component: string): void;
};

export type Drawer = {
  engine: Pick<Engine, "read" | "subscribe" | "commit">;
  glass: Glass;
  // The components realized here, and what each is called, by id.
  realized: ReadonlyMap<string, Realization>;
  names: ReadonlyMap<string, string>;
  // The component drawn where several could draw a value, given them and the value; and
  // the one drawing what no component takes by a type of the field.
  choose: string;
  fallback: string;
  // How a component is found for what a use naming none gives: by type among those
  // realized here (find.ts); given otherwise only by tests.
  find?: Find;
};

// A drawing as it leaves the engine: the component it names, or none, what it was given,
// and where it stands; or, where what it is given failed, the problem, said in its place.
export type Drawing = { $draw: Ref | null; given: Value[]; at: string[]; problem?: string };

export const isDrawing = (value: unknown): value is Drawing =>
  isRecord(value) && "$draw" in value && Array.isArray(value.given) && Array.isArray(value.at);

// What the chassis knows of a drawing where it stands: the component drawing it, by its
// id and, where glass ships it, its name; what it was given; and its place.
export type Standing = {
  component: string;
  name?: string;
  given: Value[];
  at: readonly string[];
  index?: number;
};

const standing = new WeakMap<Element, Standing>();

// The drawings standing at a node, the outermost first: what an inspector shows of a
// place, as the chassis drew it, never worked out again.
export function drawingsAt(node: Node | null): (Standing & { node: Element })[] {
  const found: (Standing & { node: Element })[] = [];
  for (let at = node instanceof Element ? node : (node?.parentElement ?? null); at; at = at.parentElement) {
    const here = standing.get(at);
    if (here) found.unshift({ ...here, node: at });
  }
  return found;
}

// So long a drawing made anew may take to show something before the one it replaces
// goes, so moving between answers never blanks what is shown.
const keptFor = 400;

// Draws what the root read gives into the element, again whenever it changes, until the
// function returned is called.
export async function draw(into: Element, root: Read, given: Drawer): Promise<() => void> {
  const find =
    given.find ??
    finder((read) => given.engine.read(read), given.glass, [...given.realized.keys()], given.fallback);
  const drawer: Rooted = { ...given, find, root, picked: new Map(), tried: new Set() };
  const top = spaceAt({ at: [] }, drawer);
  const unsubscribe = await drawer.engine.subscribe(root, (answer) =>
    top.redraw(() => arrange(into, ["value" in answer ? top.draw(answer.value) : note(answer.problem)])),
  );

  return () => {
    unsubscribe();
    top.dispose();
  };
}

// A space kept by the chassis: with what its drawing was given now, for the items drawn
// within it to propose their removal from.
type Kept = Space & { given: Value[]; dispose(): void };

// A drawer, and the root read it draws, which every way back is walked through; with the
// components picked for uses that could not be written, by the use, and the uses a pick
// was already offered to.
type Rooted = Drawer & {
  find: Find;
  root: Read;
  picked: Map<string, string>;
  tried: Set<string>;
};

function spaceAt(
  place: Place,
  drawer: Rooted,
  around?: Kept,
  pick: (component: string) => void = () => {},
): Kept {
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
    if (!hosts.has(index)) hosts.set(index, hostAt({ at: place.at, index }, drawer, space));
    const host = hosts.get(index)!;
    host.show(value);
    return host.node;
  }

  async function propose(
    { at, arg = 0, index }: Place,
    value: Value | typeof removed,
  ): Promise<Change | null> {
    if (value === removed) {
      const items = around?.given[0];
      if (!around || index === undefined || !Array.isArray(items)) return null;
      return around.propose({ at: around.place.at }, items.toSpliced(index, 1));
    }

    const answer = await drawer.engine.read(proposing(drawer.glass, drawer.root, at, arg, value));
    if (!("value" in answer)) throw new Error(answer.problem);
    return answer.value as unknown as Change | null;
  }

  const space: Kept = {
    place,
    glass: drawer.glass,
    given: [],
    draw,
    redraw,
    read: (read) => drawer.engine.read(read),
    subscribe: (read, listener) => {
      // A store moving answers every read again; an answer the same as the last is not
      // given again.
      let last: string | undefined;
      return drawer.engine.subscribe(read, (answer) => {
        const said = "value" in answer ? `v${JSON.stringify(answer.value)}` : `p${answer.problem}`;
        if (said === last) return;
        last = said;
        listener(answer);
      });
    },
    propose,
    commit: (change) => drawer.engine.commit(change),
    pick,
    dispose() {
      for (const host of hosts.values()) host.dispose();
      hosts.clear();
    },
  };
  return space;
}

type Host = { node: Element; show(value: Value): void; dispose(): void };

// One place a drawing stands, and what is drawn there now: updated where the same
// component draws at the same place, else made anew. Where finding a component waits on
// the engine, an older value found later never lands over a newer one.
function hostAt(place: Place, drawer: Rooted, around: Kept): Host {
  const node = document.createElement("div") as HTMLElement;
  node.className = "drawn";
  let now: { component: string; at: string; drawn: Drawn; space: Kept } | undefined;
  let turn = 0;
  let shownNow: Value = null;
  // The component picked here, for a value that is no use, so has nowhere to write it.
  let chosen: string | undefined;

  const letGo = () => {
    now?.drawn.dispose?.();
    now?.space.dispose();
    now = undefined;
  };

  // A drawing made anew put in place: at once where nothing is shown here yet or it
  // shows something already; else once it does, what was shown kept until then, at most
  // so long.
  let waiting: (() => void) | undefined;
  function put(fresh: Node) {
    waiting?.();
    const shows = () => fresh.childNodes.length > 0 || Boolean(fresh.textContent);
    if (!node.firstChild || shows()) return void node.replaceChildren(fresh);

    const observer = new MutationObserver(() => shows() && swap());
    const timer = setTimeout(swap, keptFor);
    const stop = () => {
      observer.disconnect();
      clearTimeout(timer);
      waiting = undefined;
    };
    function swap() {
      stop();
      node.replaceChildren(fresh);
    }
    waiting = stop;
    observer.observe(fresh, { childList: true, subtree: true, characterData: true });
  }

  const stand = (component: string, given: Value[], at: readonly string[]) =>
    standing.set(node, {
      component,
      ...(drawer.names.has(component) && { name: drawer.names.get(component) }),
      given,
      at,
      ...(place.index !== undefined && { index: place.index }),
    });

  function pick(component: string) {
    const use = useOf(shownNow);
    if (use) {
      drawer.picked.set(use, component);
      void written(use, component, drawer);
    } else chosen = component;
    show(shownNow);
  }

  function show(value: Value) {
    shownNow = value;
    const mine = ++turn;
    const fail = (problem: unknown) => {
      if (mine !== turn) return;
      letGo();
      waiting?.();
      standing.delete(node);
      node.replaceChildren(note(problem instanceof Error ? problem.message : String(problem)));
    };

    try {
      const shown = after(componentOf(value, place, drawer, chosen), ({ component, given, at }) => {
        if (mine !== turn) return;
        const where = at.join("/");
        if (now && now.component === component && now.at === where) {
          now.space.given = given;
          stand(component, given, at);
          return now.drawn.update(given);
        }

        letGo();
        const realization = drawer.realized.get(component);
        if (!realization) throw new Error(`the component ${component} has no realization here`);
        const space = spaceAt({ at, index: place.index }, drawer, around, pick);
        space.given = given;
        const drawn = realization(given, space);
        now = { component, at: where, drawn, space };
        stand(component, given, at);
        node.dataset.component = drawer.names.get(component) ?? component;
        put(drawn.node);
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
      waiting?.();
      letGo();
    },
  };
}

// The component that draws a value, what it is given, and where it stands: the one a
// drawing names, where it is realized here; else the one picked for it; else the one
// found for what it was given, its pick offered to the use that named none; or, where
// several are found, the one that chooses, given them and the value.
function componentOf(value: Value, place: Place, drawer: Rooted, chosen?: string) {
  const drawing = isDrawing(value) ? value : undefined;
  if (drawing?.problem !== undefined) throw new Error(drawing.problem);
  const given = drawing ? drawing.given : [value];
  const at = drawing ? drawing.at : place.at;
  const named = drawing?.$draw?.$ref;
  if (named && drawer.realized.has(named)) return { component: named, given, at };

  const use = useOf(value);
  const picked = chosen ?? (use && drawer.picked.get(use));
  if (picked) return { component: picked, given, at };

  return after(drawer.find(given), (found) => {
    if ("among" in found)
      return { component: drawer.choose, given: [found.among.map(ref), given[0] ?? null], at };
    if (found.by === "type" && use) void written(use, found.component, drawer);
    return { component: found.component, given, at };
  });
}

// The use a drawing that names no component stands for, where the field keeps it.
function useOf(value: Value): string | undefined {
  const use = isDrawing(value) && value.$draw === null ? value.at.at(-1) : undefined;
  return use === undefined || isHandle(use) ? undefined : use;
}

// A component picked for a use written into it as its fn, once a page: whether the
// use's store takes the change is the engine's to judge.
async function written(use: string, component: string, { engine, glass, tried }: Rooted) {
  if (tried.has(use)) return;
  tried.add(use);

  const answer = await engine.read(applying(glass, "holon", ref(use)));
  if (!("value" in answer) || !isRecord(answer.value)) return;
  const holon = asHolon(answer.value);
  // Made from what was read: refused, not laid over, where the use moved since.
  await engine.commit({
    holons: [{ ...holon, body: { ...holon.body, fn: ref(component) } }],
    says: `${holon.name ?? "a use"} drawn by the component found for it`,
    at: answer.at,
    strict: true,
  });
}

// The children of a node made these, touched only where they differ, so a node kept in
// place keeps its focus and its selection.
export function arrange(parent: Element, nodes: Node[]) {
  const now = [...parent.childNodes];
  if (now.length === nodes.length && now.every((node, i) => node === nodes[i])) return;
  parent.replaceChildren(...nodes);
}

// Work a drawing awaits, said by the event busy, bubbling from its node, or from the
// document where the node is no longer in it: true once it has been awaited a moment,
// and false, only then, when it is done. Gives what to call when it is done.
export function awaiting(node: Element, patience = 150): () => void {
  let said = false;
  const say = (busy: boolean) =>
    (node.isConnected ? node : document).dispatchEvent(
      new CustomEvent("busy", { bubbles: true, detail: busy }),
    );
  const timer = setTimeout(() => {
    said = true;
    say(true);
  }, patience);
  return () => {
    clearTimeout(timer);
    if (said) say(false);
    said = false;
  };
}

// A line said in place of what could not be drawn.
export function note(text: string): Node {
  const said = document.createElement("p");
  said.className = "note";
  said.textContent = text;
  return said;
}
