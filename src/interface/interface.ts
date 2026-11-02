import type { Json } from "../store/canonical.ts";
import { newId, type Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { Body } from "../store/objects.ts";
import type { HolonRead, Read } from "../engine/engine.ts";
import type { Connection } from "./connection.ts";

// The interface draws and holds nothing. It mounts what the layout names, and
// each component encloses what it is given and opens space in it, where what
// it holds is drawn in turn by the component whose type matches. What lasts,
// even where the reader stands, is in the field: the arrangement is a layout
// in the home, and every move is a commit to it.

export interface Given {
  holon: HolonRead;
  draws: string;
  with: Json;
}

export interface Space {
  open(id: Id, draws: string, given?: Json): HTMLElement;
  read(read: Read): Promise<Json>;
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

export class Interface {
  private components: HolonRead[] = [];
  private readonly modules = new Map<Name, Promise<Module>>();
  private readonly closers = new Map<HTMLElement, (() => void)[]>();

  constructor(
    private readonly engine: Connection,
    private readonly root: HTMLElement,
  ) {}

  async boot() {
    const componentType = (await this.engine.read({ name: "component" })) as Id | null;
    if (!componentType) throw new Error("the field holds no component type");
    const ids = (await this.engine.read({ instances: componentType })) as Id[];
    this.components = (await Promise.all(ids.map((id) => this.engine.read({ holon: id })))) as unknown as HolonRead[];
    addEventListener("popstate", (event: PopStateEvent) => void this.walk((event.state as { commit?: Name } | null)?.commit ?? null));
    if (!history.state) history.replaceState({ commit: await this.engine.read({ head: "home" }) }, "");
    await this.draw();
  }

  private async layout(): Promise<HolonRead> {
    const id = ((await this.engine.read({ name: "arrangement" })) ?? (await this.engine.read({ name: "entry" }))) as Id | null;
    if (!id) throw new Error("the field has no entry to boot into");
    return (await this.engine.read({ holon: id })) as unknown as HolonRead;
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
  // The first places the reader's own copy of the entry in the home.
  private async place(index: number, id: Id) {
    const layout = await this.layout();
    const body = structuredClone(layout.body) as Body & { mounts: Mount[] };
    body.mounts[index]!.reads = { $ref: id };
    const commit = await this.arrange(layout, body);
    history.pushState({ commit }, "");
    scrollTo(0, 0);
    await this.draw();
  }

  // Back and forward walk the arrangement's commits: the arrangement as it
  // stood then is committed again, so history only ever grows.
  private async walk(commit: Name | null) {
    const layout = await this.layout();
    let body: Body;
    if (commit && layout.store === "home") {
      const then = (await this.engine.read({ holon: layout.id, at: commit })) as unknown as HolonRead | null;
      body = then?.body ?? ((await this.engine.read({ holon: (await this.engine.read({ name: "entry" })) as Id })) as unknown as HolonRead).body;
    } else {
      const entry = (await this.engine.read({ name: "entry" })) as Id;
      body = ((await this.engine.read({ holon: entry })) as unknown as HolonRead).body;
    }
    await this.arrange(layout, body);
    await this.draw();
  }

  private async arrange(layout: HolonRead, body: Body): Promise<Name | null> {
    const { from: _, ...arrangement } = body;
    if (layout.store === "home")
      return (await this.engine.commit({ holons: [{ id: layout.id, instance: layout.instance, body: arrangement }] })) as Name | null;
    const id = newId();
    return (await this.engine.commit({
      holons: [{ id, instance: layout.instance, body: { ...arrangement, title: "Arrangement" } }],
      names: { arrangement: id },
    })) as Name | null;
  }

  private match(holon: HolonRead, draws: string): HolonRead | undefined {
    const able = this.components.filter((component) => (component.body.draws as string[]).includes(draws));
    const takes = (component: HolonRead) => (component.body.takes as { $ref: Id }[]).map((ref) => ref.$ref);
    return (
      able.find((component) => takes(component).some((type) => holon.instance.includes(type))) ??
      able.find((component) => takes(component).length === 0)
    );
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

  // Draws a holon into its host, and draws it again whenever it changes.
  private async drawInto(host: HTMLElement, id: Id, draws: string, given: Json, mount: number, called?: Id) {
    const space: Space = {
      open: (child, childDraws, childGiven = null) => {
        const childHost = document.createElement("div");
        childHost.className = `space ${childDraws}`;
        void this.drawInto(childHost, child, childDraws, childGiven, mount);
        this.closers.get(host)?.push(() => this.close(childHost));
        return childHost;
      },
      read: (read) => this.engine.read(read),
      place: (to) => this.place(mount, to),
    };

    const render = async (holon: HolonRead | null) => {
      for (const close of this.closers.get(host)?.splice(1) ?? []) close();
      if (!holon) return host.replaceChildren(note(`${id} is not in the field`));
      const component = called
        ? this.components.find((candidate) => candidate.id === called)
        : this.match(holon, draws);
      if (!component) return host.replaceChildren(note(`nothing draws ${holon.id} as ${draws}`));
      try {
        const module = await this.load(component);
        const drawn = await module.default({ holon, draws, with: given }, space);
        host.dataset.holon = holon.id;
        host.dataset.component = component.id;
        host.replaceChildren(drawn);
      } catch (error) {
        host.replaceChildren(note(`${component.body.title as string} could not draw ${holon.id}: ${String(error)}`));
      }
    };

    this.close(host);
    const subscription = await this.engine.subscribe({ holon: id }, (value) => void render(value as unknown as HolonRead | null));
    this.closers.set(host, [subscription.close]);
    await render(subscription.value as unknown as HolonRead | null);
  }

  // Closing a host closes its subscription and, through the spaces it opened,
  // every host beneath it.
  private close(host: HTMLElement) {
    const closers = this.closers.get(host) ?? [];
    this.closers.delete(host);
    for (const close of closers) close();
  }
}

function note(text: string) {
  const element = document.createElement("p");
  element.className = "glass-note";
  element.textContent = text;
  return element;
}
