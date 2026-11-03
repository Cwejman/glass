import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { HolonRead } from "../engine/engine.ts";
import type { Connection } from "./connection.ts";
import { isId } from "../store/id.ts";
import type { Body } from "../store/objects.ts";
import type { Read } from "../engine/engine.ts";
import { readProblem } from "../engine/field.ts";
import { references } from "../engine/references.ts";
import type {
  Component,
  Given,
  Kind,
  Made,
  Offer,
  Opening,
  Reading,
  Settings,
  Space,
  Where,
} from "./component.ts";
import { settingsProblem } from "./settings.ts";

// Drawing a slot: what it reads, a holon or a list, drawn by the component
// found for it in the kind of slot it is, opening slots of its own for what
// it holds, and drawn again whenever what it reads, or anything it read on
// the way, changes. A drawing that a newer one or a close has overtaken
// changes nothing, and lets go of what it held.
//
// Every slot says where it is: its element carries the holons it reads as
// its location, or the way of looking it reads, so a press inside it rises through the locations it passes,
// and whatever holds them, and cares, can take it. Nothing here acts on a
// press.

// What a slot is asked to draw: what it reads, what its holders offer it,
// its own word on its kind, if it has one, the settings its whole gave, and
// the component it names, if any.
export interface Call {
  reads: Reading;
  offered: Offer;
  own?: Kind;
  settings: Settings;
  called?: Id;
  // The holons drawn in full by the slots around this one.
  around?: ReadonlySet<Id>;
}

export interface Options {
  components: () => readonly HolonRead[];
  // The kinds of slot, by name, as the field holds them.
  kinds: Record<Kind, Id>;
  // Whether a holon may be written, and writing a new version of it with
  // what it brings into being: the interface's to say and to do.
  may: (holon: HolonRead) => boolean;
  write: (holon: HolonRead, body: Body, made: Made[]) => Promise<void>;
}

// The kind of slot a call is: its own word, else what its holders offer,
// else a face.
export const kindOf = (call: Pick<Call, "own" | "offered">): Kind => call.own ?? call.offered.kind ?? "face";

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
// kind of thing, and drawing in that kind of slot. A way of looking reads
// as the list it gathers, so what draws a list draws it too.
export function able(components: readonly HolonRead[], reads: Reading, kind: Id) {
  const argument = "holon" in reads ? "holon" : "list" in reads ? "list" : "expression";
  const takes = (given: string) =>
    given === argument || given === "selection" || (argument === "expression" && given === "list");
  return components.filter(
    (component) =>
      (component.body.kinds as { $ref: Id }[]).some(({ $ref }) => $ref === kind) &&
      takes((component.body.argument as string | undefined) ?? "holon"),
  );
}

// The components that can draw a holon in a slot: those that take one of
// its types, and the wildcard, which takes any holon; for a list, every
// able one.
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

// The one found for a slot. For a holon, one that takes one of its types
// before the wildcard. For a way of looking, one given ways of looking,
// else one given lists that takes nothing in particular. For a list, which says nothing of what its items
// are, one that takes nothing in particular;
// a component that takes a type for its items draws there only where a
// slot names it. Finding lives here alone, so how a component is found can
// change in one place.
export function match(components: readonly HolonRead[], reads: Reading, holon: HolonRead | null, kind: Id) {
  const fitting = candidates(components, reads, holon, kind);
  const takes = (component: HolonRead) => (component.body.takes as unknown[]).length;
  const given = (component: HolonRead) => component.body.argument;
  if ("gather" in reads)
    return (
      fitting.find((component) => given(component) === "expression") ??
      fitting.find((component) => given(component) === "list" && takes(component) === 0)
    );
  if (!("holon" in reads)) return fitting.find((component) => takes(component) === 0);
  return fitting.find((component) => takes(component) > 0) ?? fitting[0];
}

export interface Drawing {
  draw(host: HTMLElement, call: Call): Promise<void>;
  close(host: HTMLElement): void;
}

export function drawing(engine: Connection, options: Options): Drawing {
  const loaded = new Map<Name, Promise<Component>>();
  const hosted = new Map<HTMLElement, Hosted>();

  // The component a slot names, where it can draw there; one that is named
  // but is not run, or cannot draw there, is a fault, said in the slot, as
  // OpenLight's "not admitted here". A slot that names none draws with the
  // one found for it.
  const componentFor = (
    call: Call,
    holon: HolonRead | null,
    guarded: boolean,
  ): HolonRead | string | undefined => {
    const kind = options.kinds[kindOf(call)];
    const known = options.components();
    if (!call.called) return match(known, call.reads, holon, kind);

    const named = known.find(({ id }) => id === call.called);
    if (named && candidates([named], call.reads, holon, kind).length) return named;
    // Where the nesting guard turned the slot into a face, the slot did not
    // ask for it, so what it named is not at fault.
    if (guarded) return match(known, call.reads, holon, kind);
    if (!named) return "the component named here is not in the field, or is not among those run";
    return `${named.body.title as string} is named here, but cannot draw ${describe(call.reads, holon)} as a ${kindOf(call)} slot`;
  };

  // A component's code, run once for each of its versions, its style laid
  // beside the material.
  const load = (component: HolonRead) => {
    if (!loaded.has(component.version)) {
      const url = URL.createObjectURL(new Blob([component.body.code as string], { type: "text/javascript" }));
      const running = (import(/* @vite-ignore */ url) as Promise<Component>).then((module) => {
        URL.revokeObjectURL(url);
        for (const old of document.head.querySelectorAll(`style[data-component="${component.id}"]`))
          old.remove();
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
  //
  // Its reach: a component reaches the holons it was handed, the holons
  // they reference and are instances of, and whatever its own reads give
  // back; it reads only by the forms it declares, and opens slots only for
  // what it reaches. Anything else is refused, by name. A query is copied
  // before it is judged, so what is judged is what is asked.
  function spaceFor(
    held: Hosted,
    current: () => boolean,
    redraw: () => void,
    call: Call,
    holon: HolonRead | null,
    handed: Id[],
    component: HolonRead,
  ) {
    const title = component.body.title as string;
    const declared = new Set((component.body.reads ?? []) as string[]);
    const reached = new Set<Id>(handed);
    const reach = (value: unknown) => idsIn(value).forEach((id) => reached.add(id));
    if (holon) reach(holon);
    // What its holders offer it, and the settings its slot gives it, are
    // given to it as well.
    reach(call.offered);
    reach(call.settings);

    const refuse = (what: string): never => {
      throw new Error(`${title} ${what}`);
    };
    // An offer of a kind, and a slot's own word, are one of the kinds there are.
    const offerProblem = (offer: Offer | undefined, kind: unknown) => {
      if (offer?.kind !== undefined && offer.kind !== "full" && offer.kind !== "face")
        refuse(`offers the kind ${String(offer.kind)}, which is no kind`);
      if (kind !== undefined && kind !== "full" && kind !== "face")
        refuse(`says the kind ${String(kind)}, which is no kind`);
    };
    const within = (ids: Id[], doing: string) => {
      const beyond = ids.find((id) => !reached.has(id));
      if (beyond) refuse(`${doing} ${beyond}, which is beyond what it was handed or has read`);
    };

    const read = (async (asked: Read) => {
      if (!current()) refuse("reads from a drawing that has been overtaken");
      const query = copied(asked) as Read;
      const wrong = readProblem(query);
      if (wrong) refuse(`asks ${wrong}`);
      const form = Object.keys(query).find((key) => key !== "at")!;
      const isDeclared = declared.has(form);
      const handedHolon = form === "holon" && !("at" in query) && reached.has((query as { holon: Id }).holon);
      if (!handedHolon && !isDeclared) refuse(`reads ${form}, which it does not declare it reads`);
      within(askedIds(query), `reads ${form} of`);

      const subscription = await engine.subscribe(query, () => current() && redraw());
      if (current()) held.reads.push(subscription.close);
      else subscription.close();
      // Only a declared read reaches further: reading a holon one was
      // handed does not open what it points at.
      if (isDeclared) reach(subscription.value);
      return subscription.value;
    }) as Space["read"];

    // Slots opened from inside a full slot carry what it draws, so none of
    // them draws that holon full again: a holon that would stand in full
    // inside itself shows its face instead.
    const around =
      kindOf(call) === "full" && holon ? new Set([...(call.around ?? []), holon.id]) : call.around;

    const slot = (inner: Call) => {
      if (!current()) refuse("opens a slot from a drawing that has been overtaken");
      const host = document.createElement("div");
      host.className = `slot ${kindOf(inner)}`;
      if (current()) {
        held.children.push(host);
        void draw(host, inner);
      }
      return host;
    };
    // A slot opened here: what it reads, offered what this slot was offered
    // and what this component offers it, nearer over farther.
    const opened = (reads: Reading, opening: Opening | undefined): Call => {
      const { offer, settings, kind, component } = (copied(opening ?? {}) ?? {}) as Opening;
      offerProblem(offer, kind);
      if (component !== undefined) within([component], "calls");
      // What it offers and gives names only what it reaches itself.
      within(idsIn(offer), "offers");
      within(idsIn(settings), "gives");
      return {
        reads,
        offered: { ...call.offered, ...offer },
        ...(kind === "full" || kind === "face" ? { own: kind } : {}),
        settings: settings ?? {},
        ...(component ? { called: component } : {}),
        ...(around ? { around } : {}),
      };
    };

    const space: Space = {
      // One holon by its id, or several by theirs.
      open: (asked, opening) => {
        const where = copied(asked) as Where;
        if (typeof where === "string") {
          within([where], "opens");
          return slot(opened({ holon: where }, opening));
        }
        if (!Array.isArray(where) && where && typeof where === "object" && "gather" in where) {
          within(idsIn(where.gather), "opens a way of looking at");
          return slot(opened({ gather: where.gather }, opening));
        }
        if (!Array.isArray(where) || !where.every(isId)) refuse("opens what is neither a holon nor holons");
        within(where, "opens");
        return slot(opened({ list: where }, opening));
      },
      read,
      holon: async (id) => (await read({ holon: id })) as never,
      // Its one act: a new version of the holon it was given, where it may,
      // with the holons it brings into being beside it.
      write: async (body, made = []) => {
        if (!current()) refuse("writes from a drawing that has been overtaken");
        if (!holon || !options.may(holon)) refuse("writes what it may not");
        const making = copied(made) as Made[];
        if (!Array.isArray(making) || !making.every((each) => isId(each?.id) && isId(each?.instance)))
          refuse("brings into being what is not a holon with an id and a type");
        within(
          making.map(({ instance }) => instance),
          "brings into being an instance of",
        );
        await options.write(holon!, copied(body) as Body, making);
      },
    };
    return space;
  }

  // A component made of code: its module run with what the slot reads, in
  // a space of its own.
  async function code(
    held: Hosted,
    current: () => boolean,
    redraw: () => void,
    call: Call,
    holon: HolonRead | null,
    gathered: Id[],
    component: HolonRead,
  ) {
    // What the slot reads is what its component is handed: of a way of
    // looking, what it names and what it gathers.
    const list = "list" in call.reads ? call.reads.list : "gather" in call.reads ? gathered : undefined;
    const handed =
      "holon" in call.reads
        ? idsIn(holon)
        : [...list!, ...("gather" in call.reads ? idsIn(call.reads.gather) : [])];
    const space = spaceFor(held, current, redraw, call, holon, handed, component);
    const given: Given = {
      ...(holon ? { holon } : {}),
      ...(list ? { list } : {}),
      ...("gather" in call.reads ? { gathers: call.reads.gather } : {}),
      kind: kindOf(call),
      offered: call.offered,
      settings: call.settings,
      may: { write: !!holon && options.may(holon) },
    };

    const module = await load(component);
    if (!current()) return undefined;
    return module.default(given as Given<never, never>, space);
  }

  // A component made of data: its template's mounts, in order, each a slot
  // given what the component was given, of the kind it says. It draws
  // nothing of its own, so what stands in full around it is what stood
  // around its own slot.
  function template(held: Hosted, current: () => boolean, call: Call, component: HolonRead) {
    const named = (id: Id | undefined) =>
      (Object.keys(options.kinds) as Kind[]).find((kind) => options.kinds[kind] === id);
    const mounts = component.body.template as { kind?: { $ref: Id }; component?: { $ref: Id } }[];
    const element = document.createElement("div");
    element.className = "template";
    for (const mount of mounts) {
      const host = document.createElement("div");
      const own = named(mount.kind?.$ref);
      const inner: Call = {
        reads: call.reads,
        offered: call.offered,
        ...(own ? { own } : {}),
        settings: {},
        ...(mount.component ? { called: mount.component.$ref } : {}),
        ...(call.around ? { around: call.around } : {}),
      };
      host.className = `slot ${kindOf(inner)}`;
      if (!current()) return undefined;
      held.children.push(host);
      void draw(host, inner);
      element.append(host);
    }
    return element;
  }

  async function draw(host: HTMLElement, asked: Call) {
    close(host);
    const held: Hosted = { closed: false, drawing: 0, children: [], reads: [] };
    hosted.set(host, held);
    let read: HolonRead | null = null;
    let gathered: Id[] = [];
    if ("gather" in asked.reads) host.dataset.expression = JSON.stringify(asked.reads.gather);
    else host.dataset.location = JSON.stringify(locationOf(asked.reads));
    // The settings its slot gave, which no offer reaches.
    if (Object.keys(asked.settings).length) host.dataset.said = Object.keys(asked.settings).join(" ");

    const render = async () => {
      if (held.closed) return;
      const turn = ++held.drawing;
      const current = () => !held.closed && held.drawing === turn;
      release(held);
      delete host.dataset.holon;
      delete host.dataset.instance;
      delete host.dataset.component;

      const holon = "holon" in asked.reads ? (read as HolonRead | null) : null;
      if ("holon" in asked.reads && !holon)
        return host.replaceChildren(note(`${asked.reads.holon} is not in the field`));

      // A holon already standing in full around this slot is shown here as
      // its face.
      const guarded = kindOf(asked) === "full" && !!holon && !!asked.around?.has(holon.id);
      const call: Call = guarded
        ? { ...asked, own: "face", offered: { ...asked.offered, kind: "face" } }
        : asked;
      host.className = `slot ${kindOf(call)}`;
      // A face is entered, a holon's or a way of looking's, so it can be
      // reached by the keyboard as a press can.
      if (kindOf(call) === "face" && (holon || "gather" in call.reads)) host.tabIndex = 0;
      else host.removeAttribute("tabindex");

      const found = componentFor(call, holon, guarded);
      if (typeof found !== "object")
        return host.replaceChildren(
          note(found ?? `nothing draws ${describe(call.reads, read)} as a ${kindOf(call)} slot`),
        );
      const component = found;

      try {
        const wrong = settingsProblem(component, call.settings);
        if (wrong) return host.replaceChildren(note(`${component.body.title as string} was given ${wrong}`));
        const settled = { ...call, settings: bound(component, call) };

        const drawn = component.body.template
          ? template(held, current, settled, component)
          : await code(held, current, () => void render(), settled, holon, gathered, component);
        if (!current() || !drawn) return;

        if (holon) {
          host.dataset.holon = holon.id;
          host.dataset.instance = holon.instance.join(" ");
        }
        host.dataset.component = component.id;
        host.replaceChildren(drawn);
      } catch (error) {
        if (!current()) return;
        const said = `${component.body.title as string} could not draw ${describe(call.reads, read)}: ${error instanceof Error ? error.message : String(error)}`;
        host.replaceChildren(note(said));
      }
    };

    // A holon is read, and drawn again when it changes; a way of looking is
    // gathered, and drawn again when what it gathers changes; a list is what
    // it is, and its items each read their own. A read that fails is said in
    // the slot.
    if ("list" in asked.reads) return render();
    try {
      const subscription =
        "gather" in asked.reads
          ? await engine.subscribe({ gather: asked.reads.gather }, (value) => {
              gathered = value as Id[];
              void render();
            })
          : await engine.subscribeHolon(asked.reads.holon, (value) => {
              read = value;
              void render();
            });
      if (held.closed) return subscription.close();

      held.unsubscribe = subscription.close;
      if ("gather" in asked.reads) gathered = subscription.value as Id[];
      else read = subscription.value as HolonRead | null;
    } catch (error) {
      if (!held.closed)
        host.replaceChildren(
          note(
            `${describe(asked.reads, null)} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      return;
    }
    await render();
  }

  return { draw, close };
}

// The settings a component is drawn with: those its slot gave, and, for
// each it declares that the slot left unsaid, what its holders offer under
// that name, where the offer fits. An offer is for everything beneath, so
// one that does not fit this component is passed by, not a fault.
function bound(component: HolonRead, call: Call): Settings {
  const settings = { ...call.settings };
  for (const key of Object.keys((component.body.settings ?? {}) as object)) {
    const offered = call.offered[key];
    if (key in settings || offered === undefined) continue;
    if (!settingsProblem(component, { ...settings, [key]: offered })) settings[key] = offered;
  }
  return settings;
}

// Where a slot is: the holons it reads, in order.
const locationOf = (reads: Reading): Id[] =>
  "holon" in reads ? [reads.holon] : "list" in reads ? reads.list : [];

// The holons a read or its answer names: ids standing alone or as
// references, a holon's own references and types, a gathering's items.
function idsIn(value: unknown): Id[] {
  if (typeof value === "string") return isId(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(idsIn);
  if (value === null || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Object.hasOwn(record, "version") && Object.hasOwn(record, "body")) {
    const holon = record as unknown as HolonRead;
    return [holon.id, ...holon.instance, ...references(holon.body).map(({ id }) => id)];
  }
  return Object.values(record).flatMap(idsIn);
}

// The holons a query asks about, by its form: the one it names, or every
// holon its expression names.
function askedIds(query: Read): Id[] {
  if ("holon" in query) return [query.holon];
  if ("holders" in query) return [query.holders];
  if ("instances" in query) return [query.instances];
  if ("gather" in query) return idsIn(query.gather);
  if ("groups" in query) return idsIn(query.groups);
  return [];
}

// A value as plain data, so what is judged is what is used.
const copied = (value: unknown) => JSON.parse(JSON.stringify(value ?? null)) as unknown;

const describe = (reads: Reading, read: unknown) => {
  if ("list" in reads) return "a list";
  if ("gather" in reads) return "a way of looking";
  return String((read as HolonRead | null)?.body.title ?? reads.holon);
};

export function note(text: string) {
  const element = document.createElement("p");
  element.className = "glass-note";
  element.textContent = text;
  return element;
}
