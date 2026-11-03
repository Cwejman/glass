import type { Json } from "../../src/store/canonical.ts";
import { canonical } from "../../src/store/canonical.ts";
import { newId, type Id } from "../../src/store/id.ts";
import type { Declaration, Given, Made, Space } from "../../src/interface/component.ts";
import type { Expression } from "../../src/engine/expression.ts";
import type { MountBody, Ref } from "./bodies.ts";
import { h } from "./jsx.ts";
import { overlay } from "./menu.ts";
import { call, native, programsIn, titleOf } from "./parts.ts";

// A mount: a component and what it gives it, holons or a way of looking
// held in the mount itself, drawn in full, offered what the mount offers.
// A mount found within what another draws is shown, not run, so a view
// never opens a second view inside itself.
// A mount that may be written is where what one looks at can change: a
// press anywhere inside it rises to it with where it leads, the innermost
// place it passed, a holon or a way of looking, maybe drawn by a component
// it names, or what the mount offers, and the mount takes it, a new version
// of itself. On the secondary press it
// lays, where it was pressed, the search it is offered, given the place
// pressed and the component that place is drawn by, so what can be done
// there is found as anything is. A mount that may not be written lets a
// press rise on.

export const declared = {
  title: "Mount",
  says: "A mount: what it gives, holons or a way of looking, drawn by the component it calls, offered what it offers; where it may be written, a press inside it moves it to where the press leads, and its menu is the search, given the place pressed.",
  takes: ["mount"],
  kinds: ["full", "face"],
  reads: ["name", "holon", "gather", "instances"],
} satisfies Declaration;

export default async function draw(given: Given<MountBody>, space: Space) {
  const mount = given.holon!;
  const { title, component, argument = [], gathers } = mount.body;
  const giving = argument.map(({ $ref }) => $ref);
  if (given.kind === "face")
    return (
      <div class="card">
        <strong>{title ?? "A mount"}</strong>
        <span class="meta">
          gives {gathers ? "a way of looking" : giving.length === 1 ? "one holon" : `${giving.length} holons`}
        </span>
      </div>
    );

  // A mount within a view is shown, not run: what it is called, the
  // component it calls, and what it gives, a way of looking pressed to look
  // through it, or the holons it gives, each a face.
  if (given.offered.within) {
    const programs = await programsIn({
      name: () => space.read({ name: "program" }),
      instances: (type) => space.read({ instances: type }),
      holon: (id) => space.holon(id),
    });
    const titled = async (id: Id) => String((await space.holon(id))?.body.title ?? id);
    const calls = component ? await titled(component.$ref) : "the component found for what it gives";
    return (
      <article class="place mount-shown">
        <h1>{title ?? "A mount"}</h1>
        <p class="meta">A mount, drawn by {calls}</p>
        {gathers ? (
          <button
            type="button"
            class="lead"
            data-expression={JSON.stringify(gathers)}
            {...(component ? { "data-calls": component.$ref } : {})}
          >
            {await titleOf(programs, gathers, titled)}
          </button>
        ) : (
          space.open(giving, { offer: { kind: "face" } })
        )}
      </article>
    );
  }

  // What it offers, over what the entry offers, so a root made before the
  // entry offered something is offered it too.
  const entry = await space.read({ name: "entry" });
  const entered = entry && entry !== mount.id ? await space.holon<MountBody>(entry) : null;
  const offerOf = (body?: MountBody) => (body?.offer ?? {}) as Record<string, Json>;
  const offer = { ...offerOf(entered?.body), ...offerOf(mount.body) };
  // What it draws stands within it, so a mount found there is shown.
  const offering = { ...offer, kind: "full" as const, within: true };

  // What it gave and is no longer in the field, or the mount itself, gives
  // way to what the entry gives, so a root is never left with nothing to
  // stand in, nor stands in itself.
  const gone =
    !gathers && giving.length === 1 && (giving[0] === mount.id || !(await space.holon(giving[0]!)));
  // An expression that cannot be read gives way too, so a root is never
  // left with nothing but what is wrong with it.
  const broken =
    !!gathers &&
    (await space.read({ gather: gathers }).then(
      () => false,
      () => true,
    ));
  const fallback = gone || broken ? entered?.body : undefined;
  const looking = fallback ? fallback.gathers : gathers;
  const ids = fallback?.argument?.map(({ $ref }) => $ref) ?? giving;
  const where = looking ? { gather: looking } : ids.length === 1 ? ids[0]! : ids;
  const calling = fallback ? fallback.component : component;

  const drawn = space.open(where, { offer: offering, ...(calling ? { component: calling.$ref } : {}) });
  if (!given.may.write) return <div class="mount">{drawn}</div>;

  // A mount that may be written may move anywhere in the field, so it
  // reaches the whole of it.
  const programs = await programsIn({
    name: () => space.read({ name: "program" }),
    instances: (type) => space.read({ instances: type }),
    holon: (id) => space.holon(id),
  });
  const present = new Set(await space.read({ gather: call(native(programs, "everything")) }));
  const element = (<div class="mount">{drawn}</div>) as HTMLElement;
  let closeMenu: (() => void) | undefined;

  // What it offers of its own, but favorites no longer in the field, let go
  // of as the mount is written.
  const own = () => {
    const kept = { ...offerOf(mount.body) };
    if (Array.isArray(kept.favorites))
      kept.favorites = (kept.favorites as Ref[]).filter(({ $ref }) => present.has($ref));
    return kept;
  };

  // A new version of the mount: what it gives, and the component it calls,
  // which is for that one look; a plain move calls again what the entry
  // calls, the reader. What it offers stays its own.
  const write = (gives: Pick<MountBody, "argument" | "gathers">, by?: Id) => {
    const { component: _, argument: __, gathers: ___, offer: ____, ...rest } = mount.body;
    const offered = own();
    const calls = by ?? (entered ?? mount).body.component?.$ref;
    return space.write({
      ...rest,
      ...gives,
      ...(calls ? { component: { $ref: calls } } : {}),
      ...(Object.keys(offered).length ? { offer: offered } : {}),
    } as never);
  };
  const here = (ids: Id[]) => !looking && JSON.stringify(ids) === JSON.stringify(giving);
  // A mount does not move to itself: it is already there.
  const give = (ids: Id[], by?: Id) =>
    (here(ids) && !by) || (ids.length === 1 && ids[0] === mount.id)
      ? undefined
      : write({ argument: ids.map(($ref) => ({ $ref })) }, by);
  const look = (next: Expression, by?: Id) =>
    looking && !by && canonical(next) === canonical(looking) ? undefined : write({ gathers: next }, by);

  // What the mount offers, changed: each value said anew, or let go where
  // it is said as nothing.
  const offerAnew = (changed: Record<string, Json | null>, made: Made[] = []) => {
    const next = { ...own(), ...changed };
    for (const [key, value] of Object.entries(next)) if (value === null) delete next[key];
    const { offer: _, ...rest } = mount.body;
    return space.write({ ...rest, ...(Object.keys(next).length ? { offer: next } : {}) } as never, made);
  };

  // A way of looking kept, as a program of one's own that takes nothing and
  // gives it, born in the home and placed on the favorites.
  const keep = async (gives: Expression, title: string) => {
    const programType = await space.read({ name: "program" });
    if (!programType) throw new Error("the field holds no type for programs");
    const id = newId();
    const favorites = [...((offer.favorites ?? []) as Ref[]), { $ref: id }];
    return offerAnew({ favorites }, [{ id, instance: programType, body: { title, gives } as never }]);
  };

  // The innermost place a press passed, inside this mount; in the menu, only
  // what it offers.
  const pressedAt = (event: Event) => {
    const at = (event.target as Element).closest<HTMLElement>(
      "[data-location], [data-expression], [data-offer], [data-keep]",
    );
    if (!at || !element.contains(at)) return null;
    return at.closest(".menu") && at.tagName !== "BUTTON" ? null : at;
  };
  const go = (at: HTMLElement) => {
    const { offer: offered, keep: kept, expression, location, calls, title } = at.dataset;
    if (offered) return offerAnew(JSON.parse(offered) as Record<string, Json | null>);
    if (kept) return keep(JSON.parse(kept) as Expression, title ?? "A way of looking");
    if (expression) return look(JSON.parse(expression) as Expression, calls);
    return give(JSON.parse(location!) as Id[], calls);
  };

  const press = (event: Event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (link && !link.dataset.location) return;
    const at = pressedAt(event);
    if (!at) return;
    event.preventDefault();
    event.stopPropagation();
    closeMenu?.();
    Promise.resolve(go(at)).catch((error: unknown) => console.error(error));
  };

  element.addEventListener("click", press);
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as HTMLElement;
    if (target.closest(".menu, .search") || (!target.dataset.location && !target.dataset.expression)) return;
    press(event);
  });
  element.addEventListener("contextmenu", (event) => {
    if (event.shiftKey || (event.target as Element).closest(".menu")) return;
    event.preventDefault();
    event.stopPropagation();
    menu(event, pressedAt(event));
  });

  // The search, laid where the press landed, given the place pressed, the
  // component it is drawn by, and the settings its slot gave already.
  function menu(event: MouseEvent, at: HTMLElement | null) {
    const search = (offer.search as Ref | undefined)?.$ref;
    if (!search) return;
    const { location, expression, component: drawnBy, said } = (at ?? (drawn as HTMLElement)).dataset;
    const ids = JSON.parse(location ?? "[]") as Id[];
    const pressed = expression
      ? { gather: JSON.parse(expression) as Expression }
      : ids.length === 1
        ? ids[0]!
        : ids;
    const opened = space.open(pressed, {
      component: search,
      offer: offering,
      settings: {
        pressed: true,
        ...(drawnBy ? { drawn: { $ref: drawnBy } } : {}),
        ...(said ? { said: said.split(" ") } : {}),
      },
    });
    closeMenu?.();
    closeMenu = overlay(event.clientX, event.clientY, opened, element);
  }

  return element;
}
