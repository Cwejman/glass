import type { Json } from "../store/canonical.ts";
import { newId, type Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { Body } from "../store/objects.ts";
import type { HolonRead, Read } from "../engine/engine.ts";
import type { Connection } from "./connection.ts";

// The interface mounts what the layout names, and each component encloses
// what it is given and opens space in it, where what it holds is drawn in
// turn by the component whose type matches. Nothing it holds lasts: what it
// keeps is what it is drawing now, the components it knows and their loaded
// code, and the moves it has yet to take. What lasts, even where the reader
// stands, is in the field: the arrangement is a layout in the home, and every
// move is a commit to it.

export interface Given {
  holon: HolonRead;
  draws: string;
  with: Json;
}

// What a component is given to work with: a space to open for what it holds,
// reads of the field, which draw it again when what they read changes, and
// a way to place the reader.
export interface Space {
  open(id: Id, draws: string, given?: Json): HTMLElement;
  read(read: Read): Promise<Json>;
  holon(id: Id): Promise<HolonRead | null>;
  place(id: Id): Promise<void>;
}

interface Module {
  default: (given: Given, space: Space) => Node | Promise<Node>;
  style?: string;
}

interface Mount {
  component: { $ref: Id };
  reads: { $ref: Id };
}

// What a host holds while it is drawn: its own subscription, the hosts it
// opened and the reads it made in its last drawing. A drawing that a newer
// one or a close has overtaken changes nothing.
interface Hosted {
  closed: boolean;
  drawing: number;
  unsubscribe?: () => void;
  children: HTMLElement[];
  reads: (() => void)[];
}

export class Interface {
  private components: HolonRead[] = [];
  private readonly modules = new Map<Name, Promise<Module>>();
  private readonly hosted = new Map<HTMLElement, Hosted>();
  private moves: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly engine: Connection,
    private readonly root: HTMLElement,
  ) {}

  async boot() {
    const componentType = (await this.engine.read({ name: "component" })) as Id | null;
    if (!componentType) throw new Error("the field holds no component type");
    const components = await this.engine.subscribe({ instances: componentType }, (ids) =>
      void this.inTurn(async () => {
        await this.know(ids as Id[]);
        await this.draw();
      }),
    );
    await this.know(components.value as Id[]);
    await this.lay();
    addEventListener("popstate", (event: PopStateEvent) =>
      void this.inTurn(() => this.walk((event.state as { commit?: Name | null } | null)?.commit ?? null)),
    );
    if (!history.state) history.replaceState({ commit: await this.engine.read({ head: "home" }) }, "");
    await this.inTurn(() => this.draw());
  }

  // Moves are taken one at a time, each from where the one before left.
  private inTurn(move: () => Promise<void>) {
    const turn = this.moves.then(move);
    this.moves = turn.catch((error) => console.error(error));
    return turn;
  }

  // Every material in the field is laid on the page, and laid again when it
  // changes, so everything drawn is made of what the field says.
  private async lay() {
    const materialType = (await this.engine.read({ name: "material" })) as Id | null;
    if (!materialType) return;
    const laid = new Map<Id, HTMLStyleElement>();
    const layOne = (material: HolonRead | null, id: Id) => {
      if (!laid.has(id)) {
        const style = document.createElement("style");
        style.dataset.material = id;
        document.head.prepend(style);
        laid.set(id, style);
      }
      laid.get(id)!.textContent = material ? String(material.body.css ?? "") : "";
    };
    for (const id of (await this.engine.read({ instances: materialType })) as Id[]) {
      const material = await this.engine.subscribeHolon(id, (value) => layOne(value, id));
      layOne(material.value, id);
    }
  }

  private async know(ids: Id[]) {
    this.components = (await Promise.all(ids.map((id) => this.engine.holon(id)))).filter((holon) => holon !== null);
  }

  private async layout(): Promise<HolonRead> {
    const id = ((await this.engine.read({ name: "arrangement" })) ?? (await this.engine.read({ name: "entry" }))) as Id | null;
    if (!id) throw new Error("the field has no entry to boot into");
    return (await this.engine.holon(id))!;
  }

  private async draw() {
    for (const mount of this.root.children) this.close(mount as HTMLElement);
    const layout = await this.layout();
    const mounts = layout.body.mounts as unknown as Mount[];
    this.root.replaceChildren(
      ...mounts.map((mount, index) => {
        const host = document.createElement("div");
        host.className = "mount";
        void this.drawInto(host, mount.reads.$ref, "whole", null, index, mount.component.$ref);
        return host;
      }),
    );
  }

  // Placing changes what a mount reads, and is a commit to the arrangement.
  // The first places the reader's own copy of the entry in the home. The
  // browser's history holds the home's commit after each move.
  private place(index: number, id: Id) {
    return this.inTurn(async () => {
      const layout = await this.layout();
      const body = structuredClone(layout.body) as Body & { mounts: Mount[] };
      if (body.mounts[index]?.reads.$ref === id) return;
      body.mounts[index]!.reads = { $ref: id };
      await this.arrange(layout, body);
      history.pushState({ commit: await this.engine.read({ head: "home" }) }, "");
      scrollTo(0, 0);
      await this.draw();
    });
  }

  // Back and forward walk the arrangement's commits: the arrangement as it
  // stood then is committed again, so history only ever grows. Before the
  // reader's first move it stood as the entry.
  private async walk(commit: Name | null) {
    const layout = await this.layout();
    const then = commit && layout.store === "home" ? await this.engine.holon(layout.id, commit) : null;
    const entry = (await this.engine.holon((await this.engine.read({ name: "entry" })) as Id))!;
    await this.arrange(layout, (then ?? entry).body);
    await this.draw();
  }

  private async arrange(layout: HolonRead, body: Body) {
    const { from: _, ...arrangement } = body;
    if (layout.store === "home") {
      await this.engine.commit({ holons: [{ id: layout.id, instance: layout.instance, body: arrangement }] });
      return;
    }
    const id = newId();
    await this.engine.commit({
      holons: [{ id, instance: layout.instance, body: { ...arrangement, title: "Arrangement" } }],
      names: { arrangement: id },
    });
  }

  private load(component: HolonRead): Promise<Module> {
    if (!this.modules.has(component.version)) {
      const url = URL.createObjectURL(new Blob([component.body.code as string], { type: "text/javascript" }));
      this.modules.set(
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
    return this.modules.get(component.version)!;
  }

  // Draws a holon into its host, and draws it again whenever it, or anything
  // its component read, changes.
  private async drawInto(host: HTMLElement, id: Id, draws: string, given: Json, mount: number, called?: Id) {
    this.close(host);
    const hosted: Hosted = { closed: false, drawing: 0, children: [], reads: [] };
    this.hosted.set(host, hosted);
    let holon: HolonRead | null = null;

    const render = async () => {
      const drawing = ++hosted.drawing;
      this.release(hosted);
      const current = () => !hosted.closed && hosted.drawing === drawing;
      if (!holon) return host.replaceChildren(note(`${id} is not in the field`));
      const component = called ? this.components.find((candidate) => candidate.id === called) : match(this.components, holon, draws);
      if (!component) return host.replaceChildren(note(`nothing draws ${holon.id} as ${draws}`));

      const read = async (query: Read) => {
        const subscription = await this.engine.subscribe(query, () => void (current() && render()));
        if (current()) hosted.reads.push(subscription.close);
        else subscription.close();
        return subscription.value;
      };
      const space: Space = {
        open: (child, childDraws, childGiven = null) => {
          const childHost = document.createElement("div");
          childHost.className = `space ${childDraws}`;
          if (current()) {
            hosted.children.push(childHost);
            void this.drawInto(childHost, child, childDraws, childGiven, mount);
          }
          return childHost;
        },
        read,
        holon: async (child) => (await read({ holon: child })) as unknown as HolonRead | null,
        place: (to) => this.place(mount, to),
      };

      try {
        const module = await this.load(component);
        if (!current()) return;
        const drawn = await module.default({ holon, draws, with: given }, space);
        if (!current()) return;
        host.dataset.holon = holon.id;
        host.dataset.component = component.id;
        host.replaceChildren(drawn);
      } catch (error) {
        if (current()) host.replaceChildren(note(`${component.body.title as string} could not draw ${holon.id}: ${String(error)}`));
      }
    };

    const subscription = await this.engine.subscribeHolon(id, (value) => {
      holon = value;
      void render();
    });
    if (hosted.closed) return subscription.close();
    hosted.unsubscribe = subscription.close;
    holon = subscription.value;
    await render();
  }

  // What a host's last drawing opened and read is let go before it draws
  // again, and when it closes.
  private release(hosted: Hosted) {
    for (const child of hosted.children.splice(0)) this.close(child);
    for (const close of hosted.reads.splice(0)) close();
  }

  private close(host: HTMLElement) {
    const hosted = this.hosted.get(host);
    if (!hosted) return;
    hosted.closed = true;
    this.hosted.delete(host);
    hosted.unsubscribe?.();
    this.release(hosted);
  }
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

function note(text: string) {
  const element = document.createElement("p");
  element.className = "glass-note";
  element.textContent = text;
  return element;
}
