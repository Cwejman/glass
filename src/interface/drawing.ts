import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { HolonRead } from "../engine/engine.ts";
import type { Connection } from "./connection.ts";
import type { Component, Given, Space } from "./component.ts";

// Drawing a holon into a host: the component that matches it draws what it
// is given, opening spaces where what it holds is drawn in turn, and draws
// again whenever the holon, or anything it read, changes. A drawing that a
// newer one or a close has overtaken changes nothing, and lets go of what it
// held.

// What a host is asked to draw: a holon, in a way, with what its whole
// passed along, by the component the layout calls or else the one that
// matches, and where a move from inside it places the reader.
export interface Call {
  id: Id;
  draws: string;
  given: Json;
  place: (id: Id) => Promise<void>;
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

// The component that draws a holon in the way asked: one that takes one of
// its types, or else one that takes any holon.
export function match(
  components: readonly HolonRead[],
  holon: HolonRead,
  draws: string,
): HolonRead | undefined {
  const able = components.filter((component) => (component.body.draws as string[]).includes(draws));
  const takes = (component: HolonRead) => (component.body.takes as { $ref: Id }[]).map((ref) => ref.$ref);

  return (
    able.find((component) => takes(component).some((type) => holon.instance.includes(type))) ??
    able.find((component) => takes(component).length === 0)
  );
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

    return {
      open(id, draws, given = null) {
        const host = document.createElement("div");
        host.className = `space ${draws}`;
        if (current()) {
          held.children.push(host);
          void draw(host, { id, draws, given, place });
        }
        return host;
      },
      read,
      holon: async (id) => (await read({ holon: id })) as unknown as HolonRead | null,
      place,
    };
  }

  async function draw(host: HTMLElement, call: Call) {
    close(host);
    const held: Hosted = { closed: false, drawing: 0, children: [], reads: [] };
    hosted.set(host, held);
    let holon: HolonRead | null = null;

    const render = async () => {
      const turn = ++held.drawing;
      const current = () => !held.closed && held.drawing === turn;
      release(held);

      if (!holon) return host.replaceChildren(note(`${call.id} is not in the field`));
      const known = components();
      const component = call.called
        ? known.find(({ id }) => id === call.called)
        : match(known, holon, call.draws);
      if (!component) return host.replaceChildren(note(`nothing draws ${holon.id} as ${call.draws}`));

      const space = spaceFor(held, current, () => void render(), call.place);
      const given: Given = { holon, draws: call.draws, with: call.given };

      try {
        const module = await load(component);
        if (!current()) return;
        const drawn = await module.default(given, space);
        if (!current()) return;

        host.dataset.holon = holon.id;
        host.dataset.component = component.id;
        host.replaceChildren(drawn);
      } catch (error) {
        if (!current()) return;
        host.replaceChildren(
          note(`${component.body.title as string} could not draw ${holon.id}: ${String(error)}`),
        );
      }
    };

    const subscription = await engine.subscribeHolon(call.id, (value) => {
      holon = value;
      void render();
    });
    if (held.closed) return subscription.close();

    held.unsubscribe = subscription.close;
    holon = subscription.value;
    await render();
  }

  return { draw, close };
}

export function note(text: string) {
  const element = document.createElement("p");
  element.className = "glass-note";
  element.textContent = text;
  return element;
}
