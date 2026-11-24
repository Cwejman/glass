// The chassis on the web: what draws components on a page, given the field through the
// engine. It subscribes to the page's root read and draws what it gives: each drawing by
// the realization of the component it names, found by that component's id; one naming
// none, or a component not realized here, by the component found for it by type
// (find.ts), or, where several fit, by the one that chooses, the pick held for the page.
//
// A component is a function of what it is given and of the field: it renders, reading
// the field through io as it goes, and the chassis does the rest:
//   - reads the field for it: io.read gives the value, or nothing until it answers; the
//     expressions asked in one turn go to the engine as one read, kept live, and each
//     ends once a render no longer asks it;
//   - renders it again when what it is given changes, or an answer changes what a read
//     said, laying the new render over the one shown (morph.ts), so only what differs
//     changes; a render waiting on reads is laid out once they answer, what was shown
//     staying until then;
//   - keeps each drawing within it in place, by its key: a holon by its id, a drawing by
//     the uses it was reached through, anything else by its index; and lets go of what
//     a render no longer draws;
//   - shows a drawing made anew once it is ready, every read it and the drawings within
//     it asked answered, so what was shown stays until then and nothing is shown piece
//     by piece; or once it has waited long enough;
//   - stands each drawing as a boundary: where what it was given, a read it asked, or
//     its render fails, the component for a problem is drawn in its place;
//   - walks a value proposed where a drawing stands back to a change (back.ts), and
//     commits it; where the way back finds none, the drawing's host is marked fixed,
//     data-fixed, a fact of the place no render undoes, for the look to show.
//
// A realization renders a node. One that keeps its node for state of its own, as an
// input does, gives the node with how to update it, and is updated in place of
// rendering.
//
// The chassis names no component and draws nothing of its own but a host for each
// drawing: whoever starts it gives it the components realized here, what each is called,
// and the ones it draws for its own cases: the one that chooses, the one drawing what no
// component takes by a type, and the one saying a problem.

import type { Change } from "../../engine/commit/change.ts";
import type { Answer, Engine, Read } from "../../engine/engine.ts";
import { after, waits } from "../../engine/read/maybe.ts";
import { isRecord, isRef, ref, type Ref, type Value } from "../../engine/read/values.ts";
import {
  applying,
  filled,
  isExpression,
  proposing,
  textOf,
  together,
  type Expression,
  type Glass,
} from "../../language/shipped.ts";
import { finder, type Find } from "./find.ts";
import { morph, type Hosts } from "./morph.ts";

// What a read asks: an expression written in code, q`print(${step})`, or a read whole.
export type Asked = Expression | Read;

// What a read says: its value, or the problem it met.
export type Said = { value: Value } | { problem: string };

// A drawing that keeps its node: how it takes what it is given next, and lets go.
export type Drawn = { node: Node; update(given: Value[]): void; dispose?(): void };

export type Realization = (given: Value[], io: IO) => Node | Drawn;

// Where a drawing stands: the uses walked to it from the root, and its index among the
// drawings beside it.
export type Place = { at: readonly string[]; index?: number };

// The chassis's actions, where a drawing stands:
//   read     the field, as the drawing renders: the value, or nothing until it answers;
//   ask      the field, once, as a handler does;
//   draw     a value within it, at an index among what it draws, by what draws that;
//   propose  a value in place of what it was given at arg, committed where the way back
//            finds a change; true once it lands;
//   remove   proposes it taken out of the list it is drawn in;
//   pick     the component drawing it, where it is to be chosen.
export type IO = {
  read(asked: Asked): Value | undefined;
  ask(asked: Asked): Promise<Said>;
  draw(value: Value, index?: number): Node;
  propose(value: Value, arg?: number): Promise<boolean>;
  remove(): Promise<boolean>;
  pick(component: string): void;
};

export type Drawer = {
  engine: Pick<Engine, "read" | "subscribe" | "commit">;
  glass: Glass;
  // The components realized here, and what each is called, by id.
  realized: ReadonlyMap<string, Realization>;
  names: ReadonlyMap<string, string>;
  // The component drawn where several could draw a value, given them and the value; the
  // one drawing what no component takes by a type of the field; and the one drawn in
  // place of a drawing that failed, given the problem.
  choose: string;
  fallback: string;
  problem: string;
  // How a component is found for what a use naming none gives: by type among those
  // realized here (find.ts); given otherwise only by tests.
  find?: Find;
  // Told when the page begins to wait on reads for what it shows, and when it is done.
  reading?(busy: boolean): void;
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

// So long a drawing made anew, or rendered again, waits for its reads before it is shown
// anyway.
const patience = 2000;

// Draws what the root read gives into the element, again whenever it changes, until the
// function returned is called.
export async function draw(into: Element, root: Read, given: Drawer): Promise<() => void> {
  const find =
    given.find ??
    finder((read) => given.engine.read(read), given.glass, [...given.realized.keys()], given.fallback);
  const standIns = new WeakMap<Node, Node>();
  const hostNodes = new WeakSet<Node>();
  const drawer: Rooted = {
    ...given,
    find,
    root,
    picked: new Map(),
    reads: readsOf(given),
    waiting: new Set(),
    stale: new Set(),
    laying: new Set(),
    finding: 0,
    busy: false,
    standIns,
    hostNodes,
    hosts: { hostOf: (node) => standIns.get(node), isHost: (node) => hostNodes.has(node) },
    check: () => {},
  };
  drawer.check = checker(drawer);
  const top = ioAt({ at: [] }, drawer, () => {});
  // A root that does not read is drawn as any problem is.
  const drawn = (answer: Answer): Value =>
    "value" in answer ? answer.value : { $draw: ref(drawer.problem), given: [answer.problem], at: [] };
  const unsubscribe = await drawer.engine.subscribe(root, (answer) => {
    top.begin();
    const host = drawer.hosts.hostOf(top.draw(drawn(answer)))!;
    top.end();
    top.prune();
    if (into.firstChild !== host || into.childNodes.length !== 1) into.replaceChildren(host);
  });

  return () => {
    unsubscribe();
    top.dispose();
  };
}

// A drawer, and the root read every way back is walked through; with the components
// picked for drawings, by the use they stand for; the reads asked; the drawings made
// anew waiting to be shown, and those whose reads answered anew, to render again; and
// the hosts a render names by stand-ins.
type Rooted = Drawer & {
  find: Find;
  root: Read;
  picked: Map<string, string>;
  reads: Reads;
  waiting: Set<Host>;
  stale: Set<Made>;
  laying: Set<Made>;
  finding: number;
  busy: boolean;
  standIns: WeakMap<Node, Node>;
  hostNodes: WeakSet<Node>;
  hosts: Hosts;
  check(): void;
};

// The actions the chassis keeps for a drawing: with what it was given now, for the items
// drawn within it to propose their removal from; a render begun and ended, after which
// what it no longer reads is stopped, and, once it is laid out, what it no longer draws
// let go; and whether it, and every drawing it draws, has what it asked.
type Kept = IO & {
  given: Value[];
  begin(): void;
  end(): void;
  prune(): void;
  ready(): boolean;
  dispose(): void;
};

// What the host a drawing stands in does for it: picks its component, says what value it
// shows, and draws the problem it met in its place.
type Hosting = {
  pick(component: string): void;
  shown(): Value;
  fail(problem: string): void;
  fixed(): void;
};

const unhosted: Hosting = { pick: () => {}, shown: () => null, fail: () => {}, fixed: () => {} };

// A read a drawing asked: what it last said, and how it is stopped.
type Reading = { said?: Said; stop(): void };

// What a template is known by, so a read asked again in the next render is the same read.
const templates = new WeakMap<TemplateStringsArray, number>();
let known = 0;
const keyOf = (asked: Asked) => {
  if (!isExpression(asked)) return `read ${JSON.stringify(asked)}`;
  if (!templates.has(asked.written)) templates.set(asked.written, ++known);
  return `${templates.get(asked.written)} ${JSON.stringify(asked.values)}`;
};

// Where a drawing stands, as the chassis keeps it: rendering asks it to render again
// once an answer changes what a read said. What it draws is named in its render by a
// stand-in, which the host takes the place of as the render is laid out.
function ioAt(
  place: Place,
  drawer: Rooted,
  rendering: () => void,
  around?: Kept,
  hosting: Hosting = unhosted,
): Kept {
  const hosts = new Map<string, Host>();
  const reads = new Map<string, Reading>();
  let drawn = new Set<string>();
  let asked = new Set<string>();

  function read(wanted: Asked): Value | undefined {
    const key = keyOf(wanted);
    asked.add(key);
    let reading = reads.get(key);
    if (!reading) {
      const made: Reading = { stop: () => {} };
      reads.set(key, (reading = made));
      // An answer that says something new renders again; a problem fails the drawing.
      made.stop = drawer.reads.ask(wanted, (said) => {
        if ("problem" in said) return hosting.fail(said.problem);
        if (made.said && JSON.stringify(made.said) === JSON.stringify(said)) return;
        made.said = said;
        rendering();
      }).stop;
    }
    return reading.said && "value" in reading.said ? reading.said.value : undefined;
  }

  function draw(value: Value, index = 0): Node {
    const identity = identityOf(value);
    const key = identity !== undefined && !drawn.has(identity) ? identity : `${identity ?? ""}#${index}`;
    drawn.add(key);
    if (!hosts.has(key)) hosts.set(key, hostAt({ at: place.at, index }, drawer, io));
    const host = hosts.get(key)!;
    host.place.index = index;
    host.show(value);
    const standIn = document.createComment("");
    drawer.standIns.set(standIn, host.node);
    return standIn;
  }

  // The change a value proposed at arg would make, or null where the way back finds none.
  async function changeOf(value: Value, arg: number) {
    const answer = await drawer.engine.read(proposing(drawer.glass, drawer.root, place.at, arg, value));
    if (!("value" in answer)) throw new Error(answer.problem);
    return answer.value;
  }

  async function propose(value: Value, arg = 0) {
    const change = await changeOf(value, arg);
    if (!isRecord(change)) {
      hosting.fixed();
      return false;
    }
    const committed = await drawer.engine.commit(change as unknown as Change);
    return !("refused" in committed);
  }

  const io: Kept = {
    given: [],
    read,
    ask: (wanted) =>
      drawer.reads.resolved(wanted).then(
        (resolved) => drawer.engine.read(resolved).then(saidOf),
        (problem) => ({ problem: said(problem) }),
      ),
    draw,
    propose,
    // Only where the drawing around it was given a list holding it at its index.
    async remove() {
      const items = around?.given[0];
      const index = place.index;
      if (!around || index === undefined || !Array.isArray(items)) return false;
      if (JSON.stringify(items[index] ?? null) !== JSON.stringify(hosting.shown())) return false;
      return around.propose(items.toSpliced(index, 1));
    },
    pick: hosting.pick,
    begin() {
      drawn = new Set();
      asked = new Set();
    },
    end() {
      for (const [key, reading] of reads)
        if (!asked.has(key)) {
          reading.stop();
          reads.delete(key);
        }
      drawer.check();
    },
    prune() {
      for (const [key, host] of hosts)
        if (!drawn.has(key)) {
          host.dispose();
          hosts.delete(key);
        }
    },
    ready: () =>
      [...reads.values()].every((reading) => reading.said !== undefined) &&
      [...hosts].every(([key, host]) => !drawn.has(key) || host.ready()),
    dispose() {
      for (const reading of reads.values()) reading.stop();
      reads.clear();
      for (const host of hosts.values()) host.dispose();
      hosts.clear();
    },
  };
  return io;
}

// What a value is kept in place by among the drawings beside it: a holon by its id, a
// drawing by the uses it was reached through, so another component drawing there keeps
// what was shown until it is ready.
function identityOf(value: Value): string | undefined {
  if (isRef(value)) return `@${value.$ref}`;
  if (isDrawing(value)) return `/${value.at.join("/")}`;
  return undefined;
}

// A drawing as made: by which component, where, what it was given, the node it renders
// or keeps, how it renders again, and the actions kept for it.
type Made = {
  component: string;
  at: string;
  given: Value[];
  node?: Node;
  // A render waiting on its reads to be laid out, and since when.
  rendered?: Node;
  since?: number;
  render(): void;
  laid(force?: boolean): void;
  drawn?: Drawn;
  io: Kept;
  gone: boolean;
};

type Host = {
  node: Element;
  place: Place;
  show(value: Value): void;
  ready(): boolean;
  // A drawing made anew put in place: once ready, or forced once it has waited enough.
  shown(force?: boolean): boolean;
  dispose(): void;
};

// One place a drawing stands, and what is drawn there now: rendered again where the same
// component draws at the same place, else made anew and put in place once ready. Where
// finding a component waits on the engine, an older value found later never lands over
// a newer one.
function hostAt(place: Place, drawer: Rooted, around: Kept): Host {
  const node = document.createElement("div");
  node.className = "drawn";
  drawer.hostNodes.add(node);
  // What is shown, and what is made to replace it, waiting until it is ready.
  let now: Made | undefined;
  let next: { made: Made; since: ReturnType<typeof setTimeout> } | undefined;
  let turn = 0;
  // Whether the component drawing what is shown now is still being found.
  let finding = false;
  let shownNow: Value = null;
  // The component picked here, for the page, and the value it was picked for.
  let chosen: { component: string; for: string } | undefined;

  const letGo = (made: Made | undefined) => {
    if (!made) return;
    made.gone = true;
    made.drawn?.dispose?.();
    made.io.dispose();
    drawer.check();
  };

  function abandon() {
    if (!next) return;
    clearTimeout(next.since);
    drawer.waiting.delete(host);
    letGo(next.made);
    next = undefined;
  }

  const stand = ({ component, given, at }: Made) =>
    standing.set(node, {
      component,
      ...(drawer.names.has(component) && { name: drawer.names.get(component) }),
      given,
      at: at ? at.split("/") : [],
      ...(place.index !== undefined && { index: place.index }),
    });

  function pick(component: string) {
    const use = useOf(shownNow);
    if (use) drawer.picked.set(use, component);
    else chosen = { component, for: JSON.stringify(shownNow) };
    show(shownNow);
  }

  function found() {
    if (!finding) return;
    finding = false;
    drawer.finding--;
    drawer.check();
  }

  // A drawing failed: the component for a problem drawn in its place, given the problem,
  // and whatever was to come after it let go.
  function fail(problem: string) {
    turn++;
    found();
    abandon();
    inPlace(problem);
  }

  // The problem of the drawing shown drawn in its place, or, should the component for a
  // problem fail too, said as a line; a drawing waiting to replace it still may.
  function inPlace(problem: string) {
    letGo(now);
    now = undefined;
    try {
      put(made(drawer.problem, [problem], place.at));
    } catch {
      standing.delete(node);
      node.replaceChildren(line(problem));
    }
    drawer.check();
  }

  // A drawing made put in place of what is shown.
  function put(fresh: Made) {
    letGo(now);
    delete node.dataset.fixed;
    now = fresh;
    stand(fresh);
    node.dataset.component = drawer.names.get(fresh.component) ?? fresh.component;
    node.replaceChildren(fresh.node!);
  }

  // A drawing of a component, rendered for the first time. A drawing fails only itself:
  // failing while it is first rendered fails its making, and failing once replaced by
  // another, or let go, does nothing.
  function made(component: string, given: Value[], at: readonly string[]): Made {
    const realization = drawer.realized.get(component);
    if (!realization) throw new Error(`the component ${component} has no realization here`);
    // Its place follows the host's, as the host moves among the drawings beside it.
    const within: Place = {
      at,
      get index() {
        return place.index;
      },
    };
    let failedMaking: string | undefined;
    const making: Made = {
      component,
      at: at.join("/"),
      given,
      gone: false,
      io: undefined as unknown as Kept,
      render() {
        if (making.gone) return;
        try {
          rendered(making, realization);
        } catch (problem) {
          failing(said(problem));
        }
      },
      laid: (force) => laid(making, force),
    };
    const failing = (problem: string) => {
      if (making.gone) return;
      if (!making.node) failedMaking ??= problem;
      else if (making === next?.made || (making === now && !next)) fail(problem);
      else if (making === now) inPlace(problem);
    };
    making.io = ioAt(
      within,
      drawer,
      () => {
        drawer.stale.add(making);
        drawer.check();
      },
      around,
      { pick, shown: () => shownNow, fail: failing, fixed: () => (node.dataset.fixed = "") },
    );
    making.io.given = given;
    try {
      rendered(making, realization);
      if (failedMaking !== undefined) throw new Error(failedMaking);
      return making;
    } catch (problem) {
      making.io.dispose();
      throw problem;
    }
  }

  // A drawing rendered, or, keeping its node, updated; the render laid out at once the
  // first time, and later once every read it asked has answered.
  function rendered(making: Made, realization: Realization) {
    const { io } = making;
    io.begin();
    try {
      if (making.drawn) making.drawn.update(making.given);
      else {
        const result = realization(making.given, io);
        if (result instanceof Node) making.rendered = result;
        else making.drawn = result;
      }
    } finally {
      io.end();
    }
    if (making.drawn) {
      making.node = making.drawn.node;
      io.prune();
    } else if (!making.node) laid(making);
    else {
      making.since ??= Date.now();
      drawer.laying.add(making);
      setTimeout(drawer.check, patience);
    }
  }

  // A render laid over what was shown before it: where it is ready, the first, or has
  // waited long enough; what it no longer draws let go, and it put in the host where it
  // is shown.
  function laid(making: Made, force = false) {
    if (making.rendered && (!making.node || force || making.io.ready())) {
      making.node = morph(making.node, making.rendered, drawer.hosts);
      making.rendered = making.since = undefined;
      making.io.prune();
    }
    if (making === now && node.firstChild !== making.node) node.replaceChildren(making.node!);
  }

  function show(value: Value) {
    shownNow = value;
    const mine = ++turn;
    const failing = (problem: unknown) => mine === turn && fail(said(problem));

    try {
      const picked = chosen?.for === JSON.stringify(value) ? chosen.component : undefined;
      const shown = after(componentOf(value, place, drawer, picked), ({ component, given, at }) => {
        if (mine !== turn) return;
        found();
        const where = at.join("/");
        const latest = next?.made ?? now;
        if (latest && latest.component === component && latest.at === where) {
          if (JSON.stringify(latest.given) === JSON.stringify(given)) return;
          latest.given = latest.io.given = given;
          if (latest === now) stand(latest);
          return latest.render();
        }

        abandon();
        const fresh = made(component, given, at);
        next = { made: fresh, since: setTimeout(() => host.shown(true), patience) };
        drawer.waiting.add(host);
        drawer.check();
      });
      if (waits(shown)) {
        if (!finding) drawer.finding++;
        finding = true;
        shown.catch(failing);
      }
    } catch (problem) {
      failing(problem);
    }
  }

  const host: Host = {
    node,
    place,
    show,
    ready: () => !finding && !next && (now?.io.ready() ?? true),
    shown(force = false) {
      if (!next || (!force && !next.made.io.ready())) return false;
      const fresh = next.made;
      clearTimeout(next.since);
      next = undefined;
      drawer.waiting.delete(host);
      put(fresh);
      if (force) drawer.check();
      return true;
    },
    dispose() {
      turn++;
      if (finding) {
        finding = false;
        drawer.finding--;
      }
      abandon();
      letGo(now);
      now = undefined;
    },
  };
  return host;
}

// Once every turn's work is done: each drawing whose reads answered anew rendered again;
// then each drawing waiting that is ready put in place, the innermost first, so a drawing
// is shown with all it holds; each render waiting on reads laid out once they answered;
// and the page told whether anything still waits.
function checker(drawer: Rooted) {
  let due = false;

  function check() {
    due = false;
    while (drawer.stale.size) {
      const stale = [...drawer.stale];
      drawer.stale.clear();
      for (const made of stale) made.render();
    }
    for (let moved = true; moved; ) {
      moved = false;
      for (const host of [...drawer.waiting]) moved = host.shown() || moved;
    }
    for (const made of [...drawer.laying])
      if (made.gone || !made.rendered) drawer.laying.delete(made);
      else if (made.io.ready() || Date.now() - made.since! >= patience) {
        drawer.laying.delete(made);
        made.laid(true);
      }
    const busy = drawer.waiting.size > 0 || drawer.finding > 0 || drawer.laying.size > 0;
    if (busy !== drawer.busy) drawer.reading?.((drawer.busy = busy));
  }

  return () => {
    if (due) return;
    due = true;
    queueMicrotask(check);
  };
}

// The component that draws a value, what it is given, and where it stands: the one a
// drawing names, where it is realized here; else the one picked for it; else the one
// found for what it was given; or, where several are found, the one that chooses, given
// them and the value.
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
    return { component: found.component, given, at };
  });
}

// The use a drawing that names no component stands for.
function useOf(value: Value): string | undefined {
  return isDrawing(value) && value.$draw === null ? value.at.at(-1) : undefined;
}

const saidOf = (answer: Answer): Said =>
  "value" in answer ? { value: answer.value } : { problem: answer.problem };

// A read asked of the field, live: answered once it has been told an answer, and
// stopped by whoever asked it.
type Asking = { answered: boolean; stop(): void };
type Reads = {
  ask(asked: Asked, listener: (said: Said) => void): Asking;
  // What is asked as a read: an expression read by the language once, then filled.
  resolved(asked: Asked): Promise<Read>;
};

// The field read for every drawing. The expressions asked in one turn are asked of the
// engine as one read, each told its own place in the answer; where that one read fails,
// each is asked again alone, so one that fails fails only itself. A read asked whole is
// asked alone. Each subscription ends once all asked in it are stopped.
//
// An expression is read by the language the first time its place in the code is asked,
// as parse reads text, and kept for that place; each read only fills it with its values.
function readsOf({ engine, glass }: Drawer): Reads {
  type One = Asking & { asked: Asked; listener: (said: Said) => void; stopped: boolean };
  let turn: One[] | undefined;
  const parsed = new WeakMap<TemplateStringsArray, Promise<Read>>();

  // A template that does not read is let go, to be read again when next asked.
  function parsing(expression: Expression): Promise<Read> {
    const { written } = expression;
    if (!parsed.has(written))
      parsed.set(
        written,
        engine.read(applying(glass, "parse", textOf(expression))).then((answer) => {
          if (!("value" in answer)) throw new Error(answer.problem);
          if (answer.value === null) throw new Error("an expression written in code says nothing");
          return answer.value as unknown as Read;
        }),
      );
    const reading = parsed.get(written)!;
    reading.catch(() => parsed.get(written) === reading && parsed.delete(written));
    return reading;
  }

  const resolved = async (asked: Asked): Promise<Read> =>
    isExpression(asked) ? filled(glass, await parsing(asked), asked.values) : asked;

  // A subscription to a read, ended once every one asked in it is stopped, or at once.
  function subscribed(read: Read, told: (answer: Answer) => void, each: One[]) {
    let ended = false;
    let stop: (() => void) | undefined;
    const end = (now = false) => {
      if (ended || (!now && !each.every((one) => one.stopped))) return;
      ended = true;
      stop?.();
    };
    engine
      .subscribe(read, (answer) => !ended && told(answer))
      .then(
        (stopping) => (ended ? stopping() : (stop = stopping)),
        // A read the engine could not take is answered with why.
        (problem) => !ended && told({ at: {}, problem: said(problem) }),
      );
    return end;
  }

  const stopping = (one: One, end: () => void) => () => {
    one.stopped = one.answered = true;
    end();
  };

  const tell = (one: One, said: Said) => {
    if (one.stopped) return;
    one.answered = true;
    one.listener(said);
  };

  function alone(one: One, read: Read) {
    const end = subscribed(read, (answer) => tell(one, saidOf(answer)), [one]);
    one.stop = stopping(one, end);
  }

  function asOne(each: [One, Read][]) {
    const end = subscribed(
      together(
        glass,
        each.map(([, read]) => read),
      ),
      (answer) => {
        if (!("value" in answer) || !Array.isArray(answer.value)) {
          end(true);
          for (const [one, read] of each) if (!one.stopped) alone(one, read);
          return;
        }
        const values = answer.value;
        each.forEach(([one], i) => tell(one, { value: values[i] ?? null }));
      },
      each.map(([one]) => one),
    );
    for (const [one] of each) one.stop = stopping(one, end);
  }

  async function flush() {
    const asked = turn!;
    turn = undefined;
    const reads = await Promise.all(
      asked.map((one) =>
        resolved(one.asked).then(
          (read): [One, Read] | undefined => [one, read],
          (problem) => void tell(one, { problem: said(problem) }),
        ),
      ),
    );
    const live = reads.filter((each): each is [One, Read] => each !== undefined && !each[0].stopped);
    // A read asked whole is asked alone, so the uses its drawings stand at keep their
    // handles; expressions are asked together.
    const whole = live.filter(([one]) => !isExpression(one.asked));
    const written = live.filter(([one]) => isExpression(one.asked));
    for (const each of whole) alone(...each);
    if (written.length === 1) alone(...written[0]!);
    else if (written.length > 1) asOne(written);
  }

  return {
    resolved,
    ask(asked, listener) {
      const one: One = { asked, listener, answered: false, stopped: false, stop: () => {} };
      // Until it is asked of the engine, stopping it only marks it.
      one.stop = () => void (one.stopped = one.answered = true);
      if (!turn) {
        turn = [];
        queueMicrotask(() => void flush());
      }
      turn.push(one);
      return {
        get answered() {
          return one.answered;
        },
        stop: () => one.stop(),
      };
    },
  };
}

// A problem in words, whatever was thrown.
const said = (problem: unknown) => (problem instanceof Error ? problem.message : String(problem));

// A problem said as a line, where even the component for a problem could not draw it.
function line(problem: string): HTMLElement {
  const said = document.createElement("p");
  said.className = "note";
  said.textContent = problem;
  return said;
}

// The value a read once said, or nothing where it met a problem.
export const valueOf = (said: Said | undefined): Value | undefined =>
  said && "value" in said ? said.value : undefined;
