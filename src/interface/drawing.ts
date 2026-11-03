import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { FieldPlace, HolonRead } from "../engine/engine.ts";
import type { Connection } from "./connection.ts";
import type { Component, Given, Reading, Space } from "./component.ts";

// Drawing what a mount reads into a host, a holon, a list or the field: the
// component found for it draws what it is given, opening spaces where what
// it holds is drawn in turn, and draws again whenever what it reads, or
// anything it read on the way, changes. A drawing that a
// newer one or a close has overtaken changes nothing, and lets go of what it
// held.

// What a host is asked to draw: what its mount reads, in a way, with what
// its whole passed along, by the component the layout calls or else the one
// found for it, and where a move from inside it places the reader.
export interface Call {
  reads: Reading;
  draws: string;
  with: Json;
  place: Space["place"];
  called?: Id;
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

// The component found for what a mount reads, in the way asked. A list or
// the field is drawn by a component given that; a holon by one that takes
// one of its types, or else by the wildcard, which takes any holon. Finding
// lives here alone, so how a component is found can change in one place.
export function match(
  components: readonly HolonRead[],
  reads: Reading,
  holon: HolonRead | null,
  draws: string,
) {
  const able = components.filter((component) => fits(component, reads, draws));
  if (!("holon" in reads)) return able[0];

  const takes = (component: HolonRead) => (component.body.takes as { $ref: Id }[]).map((ref) => ref.$ref);
  return (
    able.find((component) => takes(component).some((type) => holon?.instance.includes(type))) ??
    able.find((component) => takes(component).length === 0)
  );
}

const argumentOf = (reads: Reading) => ("holon" in reads ? "holon" : "list" in reads ? "list" : "field");

// Whether a component can draw what a mount reads, in the way asked: it is
// given that kind of thing, and draws that way.
export const fits = (component: HolonRead, reads: Reading, draws: string) =>
  (component.body.draws as string[]).includes(draws) &&
  (component.body.argument ?? "holon") === argumentOf(reads);

// The component a mount names, where it can draw what the mount reads, or
// else the one found for it.
function componentFor(known: readonly HolonRead[], call: Call, holon: HolonRead | null) {
  const named = call.called ? known.find(({ id }) => id === call.called) : undefined;
  return named && fits(named, call.reads, call.draws) ? named : match(known, call.reads, holon, call.draws);
}

export interface Drawing {
  draw(host: HTMLElement, call: Call): Promise<void>;
  close(host: HTMLElement): void;
}

export function drawing(engine: Connection, components: () => readonly HolonRead[]): Drawing {
  const loaded = new Map<Name, Promise<Component>>();
  const hosted = new Map<HTMLElement, Hosted>();

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
  function spaceFor(held: Hosted, current: () => boolean, redraw: () => void, place: Call["place"]): Space {
    const read = async (query: Parameters<Space["read"]>[0]) => {
      const subscription = await engine.subscribe(query, () => current() && redraw());
      if (current()) held.reads.push(subscription.close);
      else subscription.close();
      return subscription.value;
    };

    const opened = (reads: Reading, draws: string, passed: Json) => {
      const host = document.createElement("div");
      host.className = `space ${draws}`;
      if (current()) {
        held.children.push(host);
        void draw(host, { reads, draws, with: passed, place });
      }
      return host;
    };

    return {
      open: (id, draws, passed = null) => opened({ holon: id }, draws, passed),
      openList: (ids, draws, passed = null) => opened({ list: ids }, draws, passed),
      read,
      holon: async (id) => (await read({ holon: id })) as unknown as HolonRead | null,
      place,
    };
  }

  async function draw(host: HTMLElement, call: Call) {
    close(host);
    const held: Hosted = { closed: false, drawing: 0, children: [], reads: [] };
    hosted.set(host, held);
    let read: HolonRead | FieldPlace | null = null;

    const render = async () => {
      if (held.closed) return;
      const turn = ++held.drawing;
      const current = () => !held.closed && held.drawing === turn;
      release(held);

      const holon = "holon" in call.reads ? (read as HolonRead | null) : null;
      if ("holon" in call.reads && !holon)
        return host.replaceChildren(note(`${call.reads.holon} is not in the field`));

      const component = componentFor(components(), call, holon);
      if (!component)
        return host.replaceChildren(note(`nothing draws ${describe(call.reads)} as ${call.draws}`));

      const space = spaceFor(held, current, () => void render(), call.place);
      const given: Given = {
        ...(holon ? { holon } : {}),
        ...("list" in call.reads ? { list: call.reads.list } : {}),
        ...("field" in call.reads ? { field: read as FieldPlace } : {}),
        draws: call.draws,
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
        host.replaceChildren(
          note(`${component.body.title as string} could not draw ${describe(call.reads)}: ${String(error)}`),
        );
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

const describe = (reads: Reading) =>
  "holon" in reads ? reads.holon : "list" in reads ? "a list" : "the field";

export function note(text: string) {
  const element = document.createElement("p");
  element.className = "glass-note";
  element.textContent = text;
  return element;
}
