// Drawing a slot: what it reads, a holon or a list or a way of looking, drawn by the
// component found for it in the kind of slot it is, opening slots of its own for what
// it holds, and drawn again whenever what it read changes. A drawing that a newer one
// or a close has overtaken changes nothing, and lets go of what it held.
//
// Every slot says where it is: its element carries the holons it reads, so a press
// inside it rises through those locations to whatever holds them and cares. Nothing
// here acts on a press.

import type { Holon } from "../integrations/glass/store.ts";
import type { Expression } from "../engine/expression.ts";
import { bodyProblem, references, type Mould } from "../engine/moulds.ts";
import { askedOf, formOf, idsIn, notASet, type HolonRead, type Read } from "../engine/reads.ts";
import type { Place } from "./address.ts";
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
import type { Connection } from "./connection.ts";
import { candidates, match } from "./finding.ts";

// What a way of looking gives that is a set: holons, each by its id.
const isSet = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof (item as { $ref?: unknown })?.$ref === "string");

// What a slot is asked to draw.
export type Call = {
  reads: Reading;
  offered: Offer;
  own?: Kind;
  settings: Settings;
  called?: string;
  around?: ReadonlySet<string>; // What stands in full around this slot.
};

export type Options = {
  components: readonly HolonRead[];
  may: (holon: HolonRead) => boolean;
  write: (holon: HolonRead, body: Holon["body"], made: Made[]) => Promise<void>;
  move: (place: Place) => Promise<void>;
  load?: (component: HolonRead) => Promise<Component>;
};

const kindOf = (call: Pick<Call, "own" | "offered">): Kind => call.own ?? call.offered.kind ?? "face";

const copied = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null));

export function note(text: string) {
  const element = document.createElement("p");

  element.className = "glass-note";
  element.textContent = text;

  return element;
}

function describe(reads: Reading, holon: HolonRead | null) {
  if ("list" in reads) return "a list";
  if ("gather" in reads) return "a way of looking";

  return holon?.name ?? reads.holon;
}

const settingsOf = (component: HolonRead) => (component.body.settings ?? {}) as Mould;

// The settings a component is drawn with: those its slot gave, and, for each it
// declares that the slot left unsaid, what its holders offer under that name, where
// the offer fits. An offer is for everything beneath, so one that does not fit is
// passed by, and is no fault.
function settled(component: HolonRead, call: Call): Settings {
  const settings = { ...call.settings };

  for (const key of Object.keys(settingsOf(component))) {
    const offered = call.offered[key];

    if (key in settings || offered === undefined) continue;
    if (!bodyProblem({ ...settings, [key]: offered }, [settingsOf(component)])) settings[key] = offered;
  }

  return settings;
}

// A component's code, run once for each of its versions, its style laid with it.
function runCode() {
  const loaded = new Map<string, Promise<Component>>();

  return (component: HolonRead) => {
    const key = component.version + component.id;
    let running = loaded.get(key);

    if (!running) {
      const url = URL.createObjectURL(new Blob([component.body.code as string], { type: "text/javascript" }));

      running = (import(/* @vite-ignore */ url) as Promise<Component>).then((module) => {
        URL.revokeObjectURL(url);

        if (module.style) {
          const style = document.createElement("style");
          style.dataset.component = component.id;
          style.textContent = module.style;
          document.head.append(style);
        }

        return module;
      });

      loaded.set(key, running);
    }

    return running;
  };
}

export type Drawing = {
  draw(host: HTMLElement, call: Call): Promise<void>;
  close(host: HTMLElement): void;
};

export function drawing(
  engine: Connection,
  { components, may, write, move, load = runCode() }: Options,
): Drawing {
  const hosts = new Map<HTMLElement, () => void>();

  // The component a slot names, where it can draw there; one named that cannot is
  // said so in the slot, rather than quietly replaced. Where the nesting guard turned
  // the slot into a face, the slot did not ask for that, so it is not at fault.
  function componentFor(
    call: Call,
    holon: HolonRead | null,
    guarded: boolean,
    value = false,
  ): HolonRead | string {
    const kind = kindOf(call);
    const found = () =>
      match(components, call.reads, holon, kind, value) ??
      `nothing draws ${describe(call.reads, holon)} as a ${kind} slot`;

    if (!call.called) return found();

    const named = components.find(({ id }) => id === call.called);

    if (named && candidates([named], call.reads, holon, kind, value).length) return named;
    if (guarded) return found();
    if (!named) return "the component named here is not in the field, or is not among those run";

    return `${named.name} is named here, but cannot draw ${describe(call.reads, holon)} as a ${kind} slot`;
  }

  async function draw(host: HTMLElement, asked: Call) {
    close(host);

    let closed = false;
    let turn = 0;
    let children: HTMLElement[] = [];
    let reads: (() => void)[] = [];
    let holon: HolonRead | null = null;
    let gathered: string[] = [];
    // What a way of looking gives where it gives no set, read as a value instead.
    let valued: { value: unknown } | null = null;
    let stopWatching: (() => void) | undefined;

    // What takes a while says so, rather than standing empty. What arrives soon never shows it.
    const waiting = setTimeout(() => {
      if (!closed && !host.hasChildNodes()) host.replaceChildren(note("Reading…"));
    }, 400);

    function letGo() {
      for (const child of children) close(child);
      for (const stop of reads) stop();

      children = [];
      reads = [];
    }

    hosts.set(host, () => {
      closed = true;
      clearTimeout(waiting);
      stopWatching?.();
      letGo();
    });

    if ("gather" in asked.reads) host.dataset.expression = JSON.stringify(asked.reads.gather);
    else
      host.dataset.location = JSON.stringify("holon" in asked.reads ? [asked.reads.holon] : asked.reads.list);

    if (Object.keys(asked.settings).length) host.dataset.said = Object.keys(asked.settings).join(" ");

    function openSlot(call: Call) {
      const child = document.createElement("div");

      child.className = `slot ${kindOf(call)}`;
      children.push(child);
      void draw(child, call);

      return child;
    }

    // The space one drawing works in. Its reach is a ceiling: a component reaches what
    // it was handed, what that names, and what its own declared reads give back. Only
    // the holons an expression names are judged, so a component that declares the value
    // read may work out anything the field holds through the functions it reaches; it is
    // a ceiling on what is named, not on what is computed.
    function spaceFor(current: () => boolean, call: Call, component: HolonRead, handed: string[]): Space {
      const declared = new Set((component.body.reads ?? []) as string[]);
      const reached = new Set([...handed, ...idsIn(call.offered), ...idsIn(call.settings)]);

      const refuse = (what: string): never => {
        throw new Error(`${component.name} ${what}`);
      };

      // A mount the reader may write may move anywhere, so it reaches the whole field.
      const roams = !!holon && holon.types.includes("mount") && may(holon);

      const within = (ids: string[], doing: string) => {
        if (roams) return;

        const beyond = ids.find((id) => !reached.has(id));
        if (beyond) refuse(`${doing} ${beyond}, which is beyond what it was handed or has read`);
      };

      const stillCurrent = (doing: string) => {
        if (!current()) refuse(`${doing} from a drawing that has been overtaken`);
      };

      const read = (async (asked: Read) => {
        // A drawing overtaken while it works simply never hears back, and is let go.
        if (!current()) return new Promise(() => undefined);

        const query = copied(asked);
        const form = formOf(query);
        const isDeclared = declared.has(form);
        const isHanded = form === "holon" && reached.has((query as { holon: string }).holon);

        if (!isDeclared && !isHanded) refuse(`reads ${form}, which it does not declare it reads`);
        within(askedOf(query), `reads ${form} of`);

        // Told of a change, it is drawn again. Told it can no longer be read, it says so
        // and keeps watching, so it is drawn again when the read comes back.
        const subscription = await engine.subscribe<Read>(
          query,
          () => current() && void render(),
          (error) => {
            if (current())
              host.replaceChildren(note(`${component.name} cannot read ${form}: ${error.message}`));
          },
        );

        if (current()) reads.push(subscription.close);
        else subscription.close();

        // Only a declared read reaches further.
        if (isDeclared) idsIn(subscription.value).forEach((id) => reached.add(id));

        return subscription.value;
      }) as Space["read"];

      // Slots opened inside a full slot carry what it draws, so a holon that would
      // stand in full inside itself shows its face instead.
      const around =
        kindOf(call) === "full" && holon ? new Set([...(call.around ?? []), holon.id]) : call.around;

      function opened(reads: Reading, opening: Opening = {}): Call {
        const { offer, settings, kind, component: named } = copied(opening);

        if (named) within([named], "calls");
        within(idsIn(offer), "offers");
        within(idsIn(settings), "gives");

        return {
          reads,
          offered: { ...call.offered, ...offer },
          ...(kind ? { own: kind } : {}),
          settings: settings ?? {},
          ...(named ? { called: named } : {}),
          ...(around ? { around } : {}),
        };
      }

      return {
        open(where: Where, opening?: Opening) {
          stillCurrent("opens a slot");

          const asked = copied(where);

          if (typeof asked === "string") {
            within([asked], "opens");
            return openSlot(opened({ holon: asked }, opening));
          }

          if (Array.isArray(asked)) {
            within(asked, "opens");
            return openSlot(opened({ list: asked }, opening));
          }

          within(idsIn(asked.gather), "opens a way of looking at");
          return openSlot(opened({ gather: asked.gather }, opening));
        },

        close(slot) {
          close(slot);
          children = children.filter((child) => child !== slot);
        },

        async move(place) {
          stillCurrent("moves");
          if (!roams) refuse("moves, which only a mount the reader may write can");

          await move(copied(place));
        },

        read,

        holon: (async (id: string) => read({ holon: id })) as Space["holon"],

        async write(body, made = []) {
          stillCurrent("writes");
          if (!holon || !may(holon)) refuse("writes what it may not");

          await write(holon!, copied(body), copied(made));
        },
      };
    }

    // A component made of code: its module run with what the slot reads.
    async function drawnByCode(current: () => boolean, call: Call, component: HolonRead) {
      const list = "list" in call.reads ? call.reads.list : "gather" in call.reads ? gathered : undefined;

      const handed = holon
        ? [holon.id, ...holon.instance, ...references(holon.body).map(({ id }) => id)]
        : [
            ...list!,
            ...("gather" in call.reads ? idsIn(call.reads.gather) : []),
            ...(valued ? idsIn(valued.value) : []),
          ];

      const given: Given = {
        ...(holon ? { holon } : {}),
        ...(list ? { list } : {}),
        ...("gather" in call.reads ? { gathers: call.reads.gather as Expression } : {}),
        ...(valued ? { value: valued.value } : {}),
        kind: kindOf(call),
        offered: call.offered,
        settings: call.settings,
        may: { write: !!holon && may(holon) },
      };

      const space = spaceFor(current, call, component, handed);
      const module = await load(component);

      if (!current()) return undefined;

      return module.default(given as Given<never, never>, space);
    }

    // A component made of data: its template's mounts, each a slot given what the
    // component was given. It draws nothing of its own, so it adds nothing to the guard.
    function drawnByTemplate(call: Call, component: HolonRead) {
      const element = document.createElement("div");
      element.className = "template";

      for (const mount of component.body.template as { kind?: Kind; component?: { $ref: string } }[]) {
        element.append(
          openSlot({
            reads: call.reads,
            offered: call.offered,
            ...(mount.kind ? { own: mount.kind } : {}),
            settings: {},
            ...(mount.component ? { called: mount.component.$ref } : {}),
            ...(call.around ? { around: call.around } : {}),
          }),
        );
      }

      return element;
    }

    // A way of looking's refusal, said once wherever the engine runs, is how a value is
    // told from a set; it is the engine's word, kept in one place beside the reads.
    async function watchValue(gathers: unknown) {
      try {
        const watching = await engine.subscribe<Read>(
          { value: gathers },
          (value) => {
            // A value that comes to be a set is drawn again, as the set it gathers.
            if (isSet(value)) return void draw(host, asked);

            valued = { value };
            void render();
          },
          (error) => {
            if (!closed)
              host.replaceChildren(note(`${describe(asked.reads, null)} cannot be read: ${error.message}`));
          },
        );

        if (closed) return watching.close();

        stopWatching = watching.close;
        valued = { value: watching.value };
      } catch (error) {
        if (!closed)
          host.replaceChildren(
            note(
              `${describe(asked.reads, null)} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        return;
      }

      await render();
    }

    async function render() {
      if (closed) return;

      const mine = ++turn;
      const current = () => !closed && turn === mine;

      letGo();

      delete host.dataset.holon;
      delete host.dataset.instance;
      delete host.dataset.component;

      if ("holon" in asked.reads && !holon) {
        host.replaceChildren(note(`${asked.reads.holon} is not in the field`));
        return;
      }

      // A holon already standing in full around this slot shows its face.
      const guarded = kindOf(asked) === "full" && !!holon && !!asked.around?.has(holon.id);
      const call: Call = guarded
        ? { ...asked, own: "face", offered: { ...asked.offered, kind: "face" } }
        : asked;

      host.className = `slot ${kindOf(call)}`;

      // A face is entered, so it can be reached by the keyboard as a press can.
      if (kindOf(call) === "face" && (holon || "gather" in call.reads)) host.tabIndex = 0;
      else host.removeAttribute("tabindex");

      const component = componentFor(call, holon, guarded, !!valued);

      if (typeof component === "string") {
        host.replaceChildren(note(component));
        return;
      }

      try {
        const wrong = bodyProblem(call.settings, [settingsOf(component)]);

        if (wrong) {
          host.replaceChildren(note(`${component.name} was given settings that do not fit: ${wrong}`));
          return;
        }

        const bound = { ...call, settings: settled(component, call) };
        const drawn = component.body.template
          ? drawnByTemplate(bound, component)
          : await drawnByCode(current, bound, component);

        if (!current() || !drawn) return;

        if (holon) {
          host.dataset.holon = holon.id;
          host.dataset.instance = holon.types.join(" ");
        }

        host.dataset.component = component.id;
        host.replaceChildren(drawn);
      } catch (error) {
        if (!current()) return;

        const said = error instanceof Error ? error.message : String(error);
        host.replaceChildren(
          note(`${component.name} could not draw ${describe(call.reads, holon)}: ${said}`),
        );
      }
    }

    // A list is what it is, and its items each read their own. A holon or a way of
    // looking is read, and drawn again when it changes.
    if ("list" in asked.reads) {
      await render();
      return;
    }

    try {
      const query: Read =
        "gather" in asked.reads ? { gather: asked.reads.gather } : { holon: asked.reads.holon };

      const watching = await engine.subscribe<Read>(
        query,
        (value) => {
          if ("gather" in asked.reads) gathered = value as string[];
          else holon = value as HolonRead | null;

          void render();
        },
        (error) => {
          if (closed) return;

          // A way of looking that stops giving a set is drawn again, as the value it gives.
          if (error.message === notASet) void draw(host, asked);
          else host.replaceChildren(note(`${describe(asked.reads, null)} cannot be read: ${error.message}`));
        },
      );

      if (closed) {
        watching.close();
        return;
      }

      stopWatching = watching.close;

      if ("gather" in asked.reads) gathered = watching.value as string[];
      else holon = watching.value as HolonRead | null;
    } catch (error) {
      const said = error instanceof Error ? error.message : String(error);

      // A way of looking that gives no set is read as the value it gives, and watched so.
      if (said === notASet && "gather" in asked.reads && !closed) {
        await watchValue(asked.reads.gather);
        return;
      }

      if (!closed) host.replaceChildren(note(`${describe(asked.reads, null)} cannot be read: ${said}`));
      return;
    }

    await render();
  }

  function close(host: HTMLElement) {
    hosts.get(host)?.();
    hosts.delete(host);
  }

  return { draw, close };
}
