import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { FieldPlace, HolonRead } from "../engine/engine.ts";
import type { Connection } from "./connection.ts";
import { isId } from "../store/id.ts";
import type { Expression, Read } from "../engine/engine.ts";
import { isMount } from "./arrangement.ts";
import { readProblem } from "../engine/field.ts";
import { references } from "../engine/references.ts";
import type { Component, Given, Kind, Offer, Opening, Reading, Settings, Space, Where } from "./component.ts";
import { settingsProblem } from "./settings.ts";
import { offer, type Action } from "./chrome.ts";

// Drawing a slot: what it reads, a holon, a list or the field, drawn by the
// component found for it in the kind of slot it is, opening slots of its own
// for what it holds, and drawn again whenever what it reads, or anything it
// read on the way, changes. A drawing that a newer one or a close has
// overtaken changes nothing, and lets go of what it held. Every slot answers
// the secondary press with its chrome.

// What a slot is asked to draw: what it reads, what its holders offer it,
// its own word on its kind, if it has one, the settings its whole gave, the
// component it names, if any, and where a move from inside it places the
// reader. Where the slot's own data is kept somewhere writable, `keep`
// writes a change to it.
export interface Call {
  reads: Reading;
  offered: Offer;
  own?: Kind;
  settings: Settings;
  place: Space["place"];
  called?: Id;
  keep?: (change: { kind?: Kind; component?: Id | null }) => Promise<void>;
  // The holons drawn in full by the slots around this one.
  around?: ReadonlySet<Id>;
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
  // says, and where its moves and changes go. What is offered it the
  // drawing adds.
  paneOf: (layout: HolonRead, index: number, outer: Call) => Omit<Call, "offered">;
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
// kind of thing, and drawing in that kind of slot.
export function able(components: readonly HolonRead[], reads: Reading, kind: Id) {
  const argument = "holon" in reads ? "holon" : "field" in reads ? "field" : "list";
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

// The one found for a slot. For a holon, one that takes one of its types
// before the wildcard. For a list, a gathering or the field, which say
// nothing of what their items are, one that takes nothing in particular;
// a component that takes a type for its items draws there only where a
// slot names it. Finding lives here alone, so how a component is found can
// change in one place.
export function match(components: readonly HolonRead[], reads: Reading, holon: HolonRead | null, kind: Id) {
  const fitting = candidates(components, reads, holon, kind);
  const takes = (component: HolonRead) => (component.body.takes as unknown[]).length;
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

    const refuse = (what: string): never => {
      throw new Error(`${title} ${what}`);
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

    // A slot a component opens is part of the holon it draws, so a change to
    // it would be a change to that holon.
    const owner = String(holon?.body.title ?? "what holds it");
    const why =
      holon && holon.store !== "home"
        ? `this slot is part of ${owner}, kept in ${holon.store}, which is only read here`
        : `this slot is part of ${owner}, and where a change to it would be kept is not settled yet`;

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
      const { offer, settings, kind } = (copied(opening ?? {}) ?? {}) as Opening;
      return {
        reads,
        offered: { ...call.offered, ...offer },
        ...(kind === "full" || kind === "face" ? { own: kind } : {}),
        settings: settings ?? {},
        place: call.place,
        why,
        ...(around ? { around } : {}),
      };
    };

    const space: Space = {
      // One holon by its id, several by theirs, or what an expression gathers.
      open: (asked, opening) => {
        const where = copied(asked) as Where;
        if (typeof where === "string") {
          within([where], "opens");
          return slot(opened({ holon: where }, opening));
        }
        if (Array.isArray(where)) {
          within(where, "opens");
          return slot(opened({ list: where }, opening));
        }
        if (!declared.has("gather")) refuse("gathers, which it does not declare it reads");
        const wrong = readProblem({ gather: where });
        if (wrong) refuse(`gathers by ${wrong}`);
        within(idsIn(where), "gathers by");
        return slot(opened({ gather: where }, opening));
      },
      openMount: (asked, opening) => {
        const index = copied(asked);
        const mounts = holon?.body.mounts;
        if (!Array.isArray(mounts)) refuse("opens a mount of what is not a layout");
        if (
          !Number.isInteger(index) ||
          (index as number) < 0 ||
          (index as number) >= (mounts as unknown[]).length
        )
          refuse(`opens no mount ${String(index)}`);
        const mount = (mounts as unknown[])[index as number];
        if (!isMount(mount)) refuse(`opens mount ${String(index)}, which says nothing of what it reads`);
        const pane = options.paneOf(holon!, index as number, call);
        within("list" in pane.reads ? pane.reads.list : askedIds(pane.reads as Read), "opens a mount of");
        const { offer } = (copied(opening ?? {}) ?? {}) as Opening;
        return slot({ ...pane, offered: { ...call.offered, ...offer }, ...(around ? { around } : {}) });
      },
      read,
      holon: async (id) => (await read({ holon: id })) as never,
      place: call.place,
    };
    return space;
  }

  // The chrome of a slot: open what it holds as the place, draw it in the
  // other kind of slot, or with another component that can; a change is
  // kept where the slot's own data is writable, and said not to be where
  // it is not.
  function chromeOf(call: Call, holon: HolonRead | null, drawnBy: HolonRead | undefined): Action[] {
    const notKept = call.why ?? "where a change to this slot would be kept is not settled yet";
    const actions: Action[] = [];
    if (holon && !call.root)
      actions.push({ label: "Open as the place", run: () => void call.place(holon.id) });

    const other: Kind = kindOf(call) === "full" ? "face" : "full";
    if (candidates(options.components(), call.reads, holon, options.kinds[other]).length)
      actions.push({
        label: other === "full" ? "Show in full" : "Show as a face",
        ...(call.keep ? { run: () => void call.keep!({ kind: other }) } : { why: notKept }),
      });

    for (const component of candidates(options.components(), call.reads, holon, options.kinds[kindOf(call)]))
      if (component.id !== drawnBy?.id)
        actions.push({
          label: `Draw with ${component.body.title as string}`,
          ...(call.keep ? { run: () => void call.keep!({ component: component.id }) } : { why: notKept }),
        });
    return actions;
  }

  async function draw(host: HTMLElement, asked: Call) {
    close(host);
    const held: Hosted = { closed: false, drawing: 0, children: [], reads: [] };
    hosted.set(host, held);
    let read: HolonRead | FieldPlace | Id[] | null = null;
    let chrome: (() => Action[]) | undefined;

    // The secondary press offers the slot's chrome; with Shift held, or where
    // the slot has nothing to offer, the browser's own menu stays.
    host.oncontextmenu = (event) => {
      const actions = chrome?.() ?? [];
      if (event.shiftKey || actions.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      offer(event.clientX, event.clientY, describe(asked.reads, read), actions, host);
    };

    const render = async () => {
      if (held.closed) return;
      const turn = ++held.drawing;
      const current = () => !held.closed && held.drawing === turn;
      release(held);
      chrome = undefined;
      delete host.dataset.holon;
      delete host.dataset.component;

      const holon = "holon" in asked.reads ? (read as HolonRead | null) : null;
      if ("holon" in asked.reads && !holon)
        return host.replaceChildren(note(`${asked.reads.holon} is not in the field`));

      // A holon already standing in full around this slot is shown here as
      // its face.
      const guarded = kindOf(asked) === "full" && !!holon && !!asked.around?.has(holon.id);
      const call: Call = guarded ? { ...asked, own: "face" } : asked;

      const found = componentFor(call, holon, guarded);
      if (typeof found !== "object") {
        chrome = () => chromeOf(call, holon, undefined);
        return host.replaceChildren(
          note(found ?? `nothing draws ${describe(call.reads, read)} as a ${kindOf(call)} slot`),
        );
      }
      const component = found;
      chrome = () => chromeOf(call, holon, component);

      try {
        const wrong = settingsProblem(component, call.settings);
        if (wrong) return host.replaceChildren(note(`${component.body.title as string} was given ${wrong}`));

        // What the slot reads is what its component is handed: the holon, the
        // list, what was gathered, or everything the field's place names.
        const handed = "list" in call.reads ? call.reads.list : idsIn(read);
        const space = spaceFor(held, current, () => void render(), call, holon, handed, component);
        const given: Given = {
          ...(holon ? { holon } : {}),
          ...("list" in call.reads ? { list: call.reads.list } : {}),
          ...("gather" in call.reads ? { list: (read as Id[] | null) ?? [] } : {}),
          ...("field" in call.reads ? { field: read as FieldPlace } : {}),
          kind: kindOf(call),
          offered: call.offered,
          settings: call.settings,
        };

        const module = await load(component);
        if (!current()) return;
        const drawn = await module.default(given as Given<never, never>, space);
        if (!current()) return;

        if (holon) host.dataset.holon = holon.id;
        host.dataset.component = component.id;
        host.replaceChildren(drawn);
      } catch (error) {
        if (!current()) return;
        const said = `${component.body.title as string} could not draw ${describe(call.reads, read)}: ${error instanceof Error ? error.message : String(error)}`;
        host.replaceChildren(note(said));
      }
    };

    // A holon, a gathering and the field are read, and drawn again when they
    // change; a list is what it is, and its items each read their own. A
    // read that fails is said in the slot.
    if ("list" in asked.reads) return render();
    const query =
      "holon" in asked.reads
        ? { holon: asked.reads.holon }
        : "gather" in asked.reads
          ? { gather: asked.reads.gather }
          : { field: true as const };
    try {
      const subscription = await engine.subscribe(query, (value) => {
        read = value as unknown as HolonRead | FieldPlace | Id[] | null;
        void render();
      });
      if (held.closed) return subscription.close();

      held.unsubscribe = subscription.close;
      read = subscription.value as unknown as HolonRead | FieldPlace | Id[] | null;
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
  return [];
}

// A value as plain data, so what is judged is what is used.
const copied = (value: unknown) => JSON.parse(JSON.stringify(value ?? null)) as unknown;

const describe = (reads: Reading, read: unknown) => {
  if ("list" in reads) return "a list";
  if ("gather" in reads) return "what is gathered";
  if ("field" in reads) return "the field";
  return String((read as HolonRead | null)?.body.title ?? reads.holon);
};

export function note(text: string) {
  const element = document.createElement("p");
  element.className = "glass-note";
  element.textContent = text;
  return element;
}
