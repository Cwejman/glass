import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { FieldPlace, HolonRead } from "../engine/engine.ts";
import type { Connection } from "./connection.ts";
import type { Component, Given, Kind, Reading, Space } from "./component.ts";
import { offer, type Action } from "./chrome.ts";

// Drawing a slot: what it reads, a holon, a list or the field, drawn by the
// component found for it in the kind of slot it is, opening slots of its own
// for what it holds, and drawn again whenever what it reads, or anything it
// read on the way, changes. A drawing that a newer one or a close has
// overtaken changes nothing, and lets go of what it held. Every slot answers
// the secondary press with its chrome.

// What a slot is asked to draw: what it reads, the kind of slot it is, what
// its whole passed along, the component it names, if any, and where a move
// from inside it places the reader. Where the slot's own data is kept
// somewhere writable, `keep` writes a change to it.
export interface Call {
  reads: Reading;
  kind: Kind;
  with: Json;
  place: Space["place"];
  called?: Id;
  keep?: (change: { kind?: Kind; component?: Id | null }) => Promise<void>;
  // Why a change to this slot cannot be kept, where it cannot.
  why?: string;
  // Whether the slot holds the page itself, the arrangement, which is never
  // placed anywhere.
  root?: boolean;
}

export interface Options {
  components: () => readonly HolonRead[];
  // The kinds of slot, by name, as the field holds them.
  kinds: Record<Kind, Id>;
  // The slot a layout's mount makes: what it reads and calls, the kind it
  // says, and where its moves and changes go.
  paneOf: (layout: HolonRead, index: number, outer: Call) => Call;
}

// What a host holds while it is drawn: its own subscription, the hosts it
// opened and the reads it made in its last drawing.
interface Hosted {
  closed: boolean;
  drawing: number;
  unsubscribe?: () => void;
  children: HTMLElement[];
  reads: (() => void)[];
}

// The components that can draw what a slot reads, in its kind: given that
// kind of thing, and drawing in that kind of slot.
export function able(components: readonly HolonRead[], reads: Reading, kind: Id) {
  const argument = "holon" in reads ? "holon" : "list" in reads ? "list" : "field";
  return components.filter(
    (component) =>
      (component.body.kinds as { $ref: Id }[]).some(({ $ref }) => $ref === kind) &&
      (component.body.argument ?? "holon") === argument,
  );
}

// The components that can draw a holon in a slot: those that take one of
// its types, and the wildcard, which takes any holon; for a list or the
// field, every able one.
export function candidates(
  components: readonly HolonRead[],
  reads: Reading,
  holon: HolonRead | null,
  kind: Id,
) {
  const fitting = able(components, reads, kind);
  if (!("holon" in reads)) return fitting;

  const takes = (component: HolonRead) => (component.body.takes as { $ref: Id }[]).map((ref) => ref.$ref);
  return fitting.filter(
    (component) =>
      takes(component).length === 0 || takes(component).some((type) => holon?.instance.includes(type)),
  );
}

// The one found for a slot: one that takes one of its holon's types before
// the wildcard. Finding lives here alone, so how a component is found can
// change in one place.
export function match(components: readonly HolonRead[], reads: Reading, holon: HolonRead | null, kind: Id) {
  const fitting = candidates(components, reads, holon, kind);
  const takes = (component: HolonRead) => (component.body.takes as unknown[]).length;
  return fitting.find((component) => takes(component) > 0) ?? fitting[0];
}

export interface Drawing {
  draw(host: HTMLElement, call: Call): Promise<void>;
  close(host: HTMLElement): void;
}

export function drawing(engine: Connection, options: Options): Drawing {
  const loaded = new Map<Name, Promise<Component>>();
  const hosted = new Map<HTMLElement, Hosted>();

  // The component a slot names, where it can draw there, or else the one
  // found for it.
  const componentFor = (call: Call, holon: HolonRead | null) => {
    const kind = options.kinds[call.kind];
    const known = options.components();
    const named = call.called ? known.find(({ id }) => id === call.called) : undefined;
    return named && candidates([named], call.reads, holon, kind).length ? named : match(known, call.reads, holon, kind);
  };

  // A component's code, run once for each of its versions, its style laid
  // beside the material.
  const load = (component: HolonRead) => {
    if (!loaded.has(component.version)) {
      const url = URL.createObjectURL(new Blob([component.body.code as string], { type: "text/javascript" }));
      const running = (import(/* @vite-ignore */ url) as Promise<Component>).then((module) => {
        if (module.style) {
          const style = document.createElement("style");
          style.dataset.component = component.id;
          style.textContent = module.style;
          document.head.append(style);
        }
        return module;
      });
      loaded.set(component.version, running);
    }
    return loaded.get(component.version)!;
  };

  const release = (held: Hosted) => {
    for (const child of held.children.splice(0)) close(child);
    for (const stop of held.reads.splice(0)) stop();
  };

  function close(host: HTMLElement) {
    const held = hosted.get(host);
    if (!held) return;

    held.closed = true;
    hosted.delete(host);
    held.unsubscribe?.();
    release(held);
  }

  // The space one drawing works in. What it opens and reads is held by the
  // host until the next drawing or a close lets it go; once the drawing is
  // overtaken, it opens and keeps nothing more.
  function spaceFor(
    held: Hosted,
    current: () => boolean,
    redraw: () => void,
    call: Call,
    holon: HolonRead | null,
  ) {
    const read = async (query: Parameters<Space["read"]>[0]) => {
      const subscription = await engine.subscribe(query, () => current() && redraw());
      if (current()) held.reads.push(subscription.close);
      else subscription.close();
      return subscription.value;
    };

    // A slot a component opens is part of the holon it draws, so a change to
    // it would be a change to that holon.
    const owner = String(holon?.body.title ?? "what holds it");
    const why =
      holon && holon.store !== "home"
        ? `this slot is part of ${owner}, kept in ${holon.store}, which is only read here`
        : `this slot is part of ${owner}, and where a change to it would be kept is not settled yet`;

    const slot = (inner: Call) => {
      const host = document.createElement("div");
      host.className = `slot ${inner.kind}`;
      if (current()) {
        held.children.push(host);
        void draw(host, inner);
      }
      return host;
    };

    const space: Space = {
      open: (id, kind, passed = null) =>
        slot({ reads: { holon: id }, kind, with: passed, place: call.place, why }),
      openList: (ids, kind, passed = null) =>
        slot({ reads: { list: ids }, kind, with: passed, place: call.place, why }),
      openMount: (index) => slot(options.paneOf(holon!, index, call)),
      read,
      holon: async (id) => (await read({ holon: id })) as unknown as HolonRead | null,
      place: call.place,
    };
    return space;
  }

  // The chrome of a slot: open what it holds as the place, draw it in the
  // other kind of slot, or with another component that can; a change is
  // kept where the slot's own data is writable, and said not to be where
  // it is not.
  function chromeOf(call: Call, holon: HolonRead | null, drawnBy: HolonRead): Action[] {
    const notKept = call.why ?? "where a change to this slot would be kept is not settled yet";
    const actions: Action[] = [];
    if (holon && !call.root) actions.push({ label: "Open as the place", run: () => void call.place(holon.id) });

    const other: Kind = call.kind === "full" ? "face" : "full";
    if (candidates(options.components(), call.reads, holon, options.kinds[other]).length)
      actions.push({
        label: other === "full" ? "Show in full" : "Show as a face",
        ...(call.keep ? { run: () => void call.keep!({ kind: other }) } : { why: notKept }),
      });

    for (const component of candidates(options.components(), call.reads, holon, options.kinds[call.kind]))
      if (component.id !== drawnBy.id)
        actions.push({
          label: `Draw with ${component.body.title as string}`,
          ...(call.keep ? { run: () => void call.keep!({ component: component.id }) } : { why: notKept }),
        });
    return actions;
  }

  async function draw(host: HTMLElement, call: Call) {
    close(host);
    const held: Hosted = { closed: false, drawing: 0, children: [], reads: [] };
    hosted.set(host, held);
    let read: HolonRead | FieldPlace | null = null;
    let chrome: (() => Action[]) | undefined;

    // The secondary press offers the slot's chrome; with Shift held, or where
    // the slot has nothing to offer, the browser's own menu stays.
    host.oncontextmenu = (event) => {
      const actions = chrome?.() ?? [];
      if (event.shiftKey || actions.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      offer(event.clientX, event.clientY, describe(call.reads, read), actions, host);
    };

    const render = async () => {
      if (held.closed) return;
      const turn = ++held.drawing;
      const current = () => !held.closed && held.drawing === turn;
      release(held);
      chrome = undefined;
      delete host.dataset.holon;
      delete host.dataset.component;

      const holon = "holon" in call.reads ? (read as HolonRead | null) : null;
      if ("holon" in call.reads && !holon)
        return host.replaceChildren(note(`${call.reads.holon} is not in the field`));

      const component = componentFor(call, holon);
      if (!component)
        return host.replaceChildren(
          note(`nothing draws ${describe(call.reads, read)} as a ${call.kind} slot`),
        );
      chrome = () => chromeOf(call, holon, component);

      const space = spaceFor(held, current, () => void render(), call, holon);
      const given: Given = {
        ...(holon ? { holon } : {}),
        ...("list" in call.reads ? { list: call.reads.list } : {}),
        ...("field" in call.reads ? { field: read as FieldPlace } : {}),
        kind: call.kind,
        with: call.with,
      };

      try {
        const module = await load(component);
        if (!current()) return;
        const drawn = await module.default(given, space);
        if (!current()) return;

        if (holon) host.dataset.holon = holon.id;
        host.dataset.component = component.id;
        host.replaceChildren(drawn);
      } catch (error) {
        if (!current()) return;
        const said = `${component.body.title as string} could not draw ${describe(call.reads, read)}: ${String(error)}`;
        host.replaceChildren(note(said));
      }
    };

    // A holon and the field are read, and drawn again when they change; a
    // list is what it is, and its items each read their own.
    if ("list" in call.reads) return render();
    const query = "holon" in call.reads ? { holon: call.reads.holon } : { field: true as const };
    const subscription = await engine.subscribe(query, (value) => {
      read = value as unknown as HolonRead | FieldPlace | null;
      void render();
    });
    if (held.closed) return subscription.close();

    held.unsubscribe = subscription.close;
    read = subscription.value as unknown as HolonRead | FieldPlace | null;
    await render();
  }

  return { draw, close };
}

const describe = (reads: Reading, read: unknown) => {
  if ("list" in reads) return "a list";
  if ("field" in reads) return "the field";
  return String((read as HolonRead | null)?.body.title ?? reads.holon);
};

export function note(text: string) {
  const element = document.createElement("p");
  element.className = "glass-note";
  element.textContent = text;
  return element;
}
