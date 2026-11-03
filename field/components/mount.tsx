import type { Json } from "../../src/store/canonical.ts";
import { canonical } from "../../src/store/canonical.ts";
import { newId, type Id } from "../../src/store/id.ts";
import type { Declaration, Given, Made, Space } from "../../src/interface/component.ts";
import type { Expression } from "../../src/engine/expression.ts";
import type { ExpressionBody, MountBody, Ref } from "./bodies.ts";
import { h } from "./jsx.ts";
import { overlay } from "./menu.ts";

// A mount: a component and what it gives it, holons or a way of looking
// held in the mount itself, drawn in full, offered what the mount offers.
// A mount that may be written is where what one looks at can change: a
// press anywhere inside it rises to it with where it leads, the innermost
// place it passed, a holon or a way of looking, maybe drawn by a component
// it names, or what the mount offers, and the mount takes it, a new version
// of itself. A way of looking kept as a holon is looked through when it is
// pressed, so the mount holds what it gathers. On the secondary press it
// lays, where it was pressed, the search it is offered, given the place
// pressed and the component that place is drawn by, so what can be done
// there is found as anything is. A mount that may not be written lets a
// press rise on.

export const declared = {
  title: "Mount",
  says: "A mount: what it gives, holons or a way of looking, drawn by the component it calls, offered what it offers; where it may be written, a press inside it moves it to where the press leads, and its menu is the search, given the place pressed.",
  takes: ["mount"],
  kinds: ["full", "face"],
  reads: ["name", "holon", "gather"],
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

  // What it offers, over what the entry offers, so a root made before the
  // entry offered something is offered it too.
  const entry = await space.read({ name: "entry" });
  const entered = entry && entry !== mount.id ? await space.holon<MountBody>(entry) : null;
  const offerOf = (body?: MountBody) => (body?.offer ?? {}) as Record<string, Json>;
  const offer = { ...offerOf(entered?.body), ...offerOf(mount.body) };
  const offering = { ...offer, kind: "full" as const };

  // A way of looking kept as a holon, given to the mount plainly, is looked
  // through, as a press on it would.
  const expressionType = await space.read({ name: "expression" });
  const plain = !component || component.$ref === (entered ?? mount).body.component?.$ref;
  const kept = giving.length === 1 && plain ? await space.holon<ExpressionBody>(giving[0]!) : null;
  // What it gave and is no longer in the field gives way to what the entry
  // gives, so a root is never left with nothing to stand in.
  const gone = !gathers && giving.length === 1 && plain && !kept;
  const looking =
    gathers ??
    (kept && expressionType && kept.instance.includes(expressionType) ? kept.body.gathers : undefined) ??
    (gone ? entered?.body.gathers : undefined);
  const where = looking ? { gather: looking } : giving.length === 1 ? giving[0]! : giving;

  const drawn = space.open(where, { offer: offering, ...(component ? { component: component.$ref } : {}) });
  if (!given.may.write) return <div class="mount">{drawn}</div>;

  // A mount that may be written may move anywhere in the field, so it
  // reaches the whole of it.
  const present = new Set(await space.read({ gather: { everything: true } }));
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
  const give = (ids: Id[], by?: Id) =>
    here(ids) && !by ? undefined : write({ argument: ids.map(($ref) => ({ $ref })) }, by);
  const look = (next: Expression, by?: Id) =>
    looking && !by && canonical(next) === canonical(looking) ? undefined : write({ gathers: next }, by);

  // A holon pressed is gone to; a way of looking kept as a holon, looked
  // through.
  const goTo = async (ids: Id[], by?: Id) => {
    const one = ids.length === 1 && !by ? await space.holon<ExpressionBody>(ids[0]!) : null;
    if (one && expressionType && one.instance.includes(expressionType)) return look(one.body.gathers);
    return give(ids, by);
  };

  // What the mount offers, changed: each value said anew, or let go where
  // it is said as nothing.
  const offerAnew = (changed: Record<string, Json | null>, made: Made[] = []) => {
    const next = { ...own(), ...changed };
    for (const [key, value] of Object.entries(next)) if (value === null) delete next[key];
    const { offer: _, ...rest } = mount.body;
    return space.write({ ...rest, ...(Object.keys(next).length ? { offer: next } : {}) } as never, made);
  };

  // A way of looking kept, as a holon born in the home, and placed on the
  // favorites.
  const keep = (kept: Expression, title: string) => {
    if (!expressionType) throw new Error("the field holds no type for ways of looking");
    const id = newId();
    const favorites = [...((offer.favorites ?? []) as Ref[]), { $ref: id }];
    return offerAnew({ favorites }, [
      { id, instance: expressionType, body: { title, gathers: kept } as never },
    ]);
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
    return goTo(JSON.parse(location!) as Id[], calls);
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
