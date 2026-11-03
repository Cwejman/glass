import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { HolonRead, Read } from "../engine/engine.ts";
import type { Connection } from "./connection.ts";
import type { Given, Space } from "./interface.ts";

// Drawing a holon into a host: the component that matches it draws what it
// is given, opening spaces where what it holds is drawn in turn, and draws
// again whenever the holon, or anything it read, changes. A drawing that a
// newer one or a close has overtaken changes nothing, and lets go of what it
// held.

interface Module {
  default: (given: Given, space: Space) => Node | Promise<Node>;
  style?: string;
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
export function match(components: readonly HolonRead[], holon: HolonRead, draws: string): HolonRead | undefined {
  const able = components.filter((component) => (component.body.draws as string[]).includes(draws));
  const takes = (component: HolonRead) => (component.body.takes as { $ref: Id }[]).map((ref) => ref.$ref);
  return (
    able.find((component) => takes(component).some((type) => holon.instance.includes(type))) ??
    able.find((component) => takes(component).length === 0)
  );
}

export interface Drawing {
  draw(
    host: HTMLElement,
    id: Id,
    draws: string,
    given: Json,
    place: (id: Id) => Promise<void>,
    called?: Id,
  ): Promise<void>;
  close(host: HTMLElement): void;
}

export function drawing(engine: Connection, components: () => readonly HolonRead[]): Drawing {
  const modules = new Map<Name, Promise<Module>>();
  const hosted = new Map<HTMLElement, Hosted>();

  // A component's code, run once for each of its versions, its style laid
  // beside the material.
  const load = (component: HolonRead) => {
    if (!modules.has(component.version)) {
      const url = URL.createObjectURL(new Blob([component.body.code as string], { type: "text/javascript" }));
      modules.set(
        component.version,
        (import(/* @vite-ignore */ url) as Promise<Module>).then((module) => {
          if (module.style) {
            const style = document.createElement("style");
            style.dataset.component = component.id;
            style.textContent = module.style;
            document.head.append(style);
          }
          return module;
        }),
      );
    }
    return modules.get(component.version)!;
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

  async function draw(
    host: HTMLElement,
    id: Id,
    draws: string,
    given: Json,
    place: (id: Id) => Promise<void>,
    called?: Id,
  ) {
    close(host);
    const held: Hosted = { closed: false, drawing: 0, children: [], reads: [] };
    hosted.set(host, held);
    let holon: HolonRead | null = null;

    const render = async () => {
      const turn = ++held.drawing;
      release(held);
      const current = () => !held.closed && held.drawing === turn;
      if (!holon) return host.replaceChildren(note(`${id} is not in the field`));
      const known = components();
      const component = called ? known.find((candidate) => candidate.id === called) : match(known, holon, draws);
      if (!component) return host.replaceChildren(note(`nothing draws ${holon.id} as ${draws}`));

      const read = async (query: Read) => {
        const subscription = await engine.subscribe(query, () => void (current() && render()));
        if (current()) held.reads.push(subscription.close);
        else subscription.close();
        return subscription.value;
      };
      const space: Space = {
        open(child, childDraws, childGiven = null) {
          const childHost = document.createElement("div");
          childHost.className = `space ${childDraws}`;
          if (current()) {
            held.children.push(childHost);
            void draw(childHost, child, childDraws, childGiven, place);
          }
          return childHost;
        },
        read,
        holon: async (child) => (await read({ holon: child })) as unknown as HolonRead | null,
        place,
      };

      try {
        const module = await load(component);
        if (!current()) return;
        const drawn = await module.default({ holon, draws, with: given }, space);
        if (!current()) return;
        host.dataset.holon = holon.id;
        host.dataset.component = component.id;
        host.replaceChildren(drawn);
      } catch (error) {
        if (current())
          host.replaceChildren(note(`${component.body.title as string} could not draw ${holon.id}: ${String(error)}`));
      }
    };

    const subscription = await engine.subscribeHolon(id, (value) => {
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
