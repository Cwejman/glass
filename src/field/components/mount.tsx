// A mount: a component and what it gives it, holons or a way of looking, drawn in
// full, offered what the mount offers. A mount found within what another draws is
// shown, not run, so a view never opens a second view inside itself.
//
// A mount that may be written is where what one looks at can change. A press anywhere
// inside it rises to it with where it leads, the innermost location it passed, and the
// mount gives that instead. A secondary press lays, where it landed, the search it is
// offered, given the place pressed, so what can be done there is found as anything is.
// A mount that may not be written lets a press rise on.

import type { Expression } from "../../engine/expression.ts";
import type { Place } from "../../interface/address.ts";
import type { Given, Made, Offer, Space } from "../../interface/component.ts";
import { h } from "./jsx.ts";
import { overlay } from "./menu.ts";
import { functionsIn, titleOf } from "./parts.ts";

type Ref = { $ref: string };

type MountBody = {
  component?: Ref;
  argument?: Ref[];
  gathers?: Expression;
  offer?: Record<string, unknown>;
};

export const declared = {
  name: "Mount",
  says: "A mount: what it gives, holons or a way of looking, drawn by the component it calls, offered what it offers; where it may be written, a press inside it moves it.",
  takes: ["mount"],
  kinds: ["full", "face"],
  reads: ["holon", "gather", "instances"],
  settings: {
    place: {
      says: "Where it looks, as the page's address says. A mount given no place is one found within what another draws, and is shown rather than run.",
      shape: "json",
      optional: true,
    },
    entry: {
      says: "The body of the entry the page boots into, whose component looks where nothing else is named, and whose offer everything beneath it looks for.",
      shape: "json",
      optional: true,
    },
  },
};

const mountCard = (name: string | undefined, gathers: Expression | undefined, giving: string[]) => (
  <div class="card">
    <strong>{name ?? "A mount"}</strong>
    <span class="meta">
      gives {gathers ? "a way of looking" : giving.length === 1 ? "one holon" : `${giving.length} holons`}
    </span>
  </div>
);

// A mount within a view is shown, not run: what it is called, the component it calls,
// and what it gives.
async function shown(mount: Given<MountBody>["holon"], space: Space, offered: Offer) {
  const { name, body } = mount!;
  const { component, gathers, argument = [] } = body;
  const titled = async (id: string) => (await space.holon(id))?.name ?? id;
  const calls = component ? await titled(component.$ref) : "the component found for what it gives";

  return (
    <article class="place mount-shown">
      <h1>{name ?? "A mount"}</h1>
      <p class="meta">A mount, drawn by {calls}</p>

      {gathers ? (
        <button
          type="button"
          class="lead"
          data-expression={JSON.stringify(gathers)}
          {...(component ? { "data-calls": component.$ref } : {})}
        >
          {await titleOf(await functionsIn(space, offered), gathers, titled)}
        </button>
      ) : (
        space.open(
          argument.map(({ $ref }) => $ref),
          { offer: { kind: "face" } },
        )
      )}
    </article>
  );
}

export default async function draw(
  given: Given<MountBody, { place?: Place; entry?: MountBody }>,
  space: Space,
) {
  const mount = given.holon!;
  const { place } = given.settings;
  const { argument = [], gathers } = place ?? mount.body;
  const giving = argument.map(({ $ref }) => $ref);

  if (given.kind === "face") return mountCard(mount.name, gathers, giving);
  if (!place) return shown(mount, space, given.offered);

  // The entry the page boots into, as the interface gives it to the root.
  const entry = given.settings.entry ?? mount.body;

  // A place that names no component is looked at with the one the entry calls.
  const component = place.component ?? entry.component;

  const offerOf = (body?: MountBody) => body?.offer ?? {};
  const offer = { ...offerOf(entry), ...offerOf(mount.body) };
  const offering: Offer = { ...offer, kind: "full" };

  const where = gathers ? { gather: gathers } : giving.length === 1 ? giving[0]! : giving;
  const drawn = space.open(where, { offer: offering, ...(component ? { component: component.$ref } : {}) });

  if (!given.may.write) return <div class="mount">{drawn}</div>;

  const element = (<div class="mount">{drawn}</div>) as HTMLElement;
  let closeMenu: (() => void) | undefined;

  // What the mount offers, changed: each value said anew.
  function offerAnew(changed: Record<string, unknown>, made: Made[] = []) {
    const next = { ...offerOf(mount.body), ...changed };

    const { offer: _, ...rest } = mount.body;

    return space.write({ ...rest, ...(Object.keys(next).length ? { offer: next } : {}) }, made);
  }

  // A way of looking kept, as a function of one's own that takes nothing and gives it,
  // born in the home and placed on the favorites.
  async function keep(gives: Expression, title: string) {
    const functionType = [...(await functionsIn(space, offer)).values()][0]?.type;
    if (!functionType) throw new Error("the entry offers no functions");

    const favorites = [...((offer.favorites ?? []) as Ref[]), { $ref: "~kept" }];

    return offerAnew({ favorites }, [
      { id: "~kept", instance: [functionType], name: title, body: { gives } },
    ]);
  }

  // The innermost place a press passed, inside this mount; in the menu, only what it offers.
  function pressedAt(event: Event) {
    const at = (event.target as Element).closest<HTMLElement>(
      "[data-location], [data-expression], [data-offer], [data-keep]",
    );

    if (!at || !element.contains(at)) return null;

    return at.closest(".menu") && at.tagName !== "BUTTON" ? null : at;
  }

  function go(at: HTMLElement) {
    const { offer: offered, keep: kept, expression, location, calls, title } = at.dataset;

    if (offered) return offerAnew(JSON.parse(offered));
    if (kept) return keep(JSON.parse(kept), title ?? "A way of looking");
    const component = calls ? { component: { $ref: calls } } : {};

    if (expression) return space.move({ gathers: JSON.parse(expression), ...component });

    const ids = JSON.parse(location!) as string[];

    // A press landing where one already stands moves nowhere, and changes nothing of how one looks.
    if (!calls && !gathers && JSON.stringify(ids) === JSON.stringify(giving)) return undefined;

    // Nowhere in particular is the root.
    return space.move(ids.length ? { argument: ids.map(($ref) => ({ $ref })), ...component } : {});
  }

  function press(event: Event) {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (link && !link.dataset.location) return;

    const at = pressedAt(event);
    if (!at) return;

    event.preventDefault();
    event.stopPropagation();
    closeMenu?.();

    Promise.resolve(go(at)).catch((error: unknown) => console.error(error));
  }

  // The search, laid where the press landed, given the place pressed and the
  // components that place is drawn by, whose settings it can set.
  function menu(event: MouseEvent, at: HTMLElement | null) {
    const search = (offer.search as Ref | undefined)?.$ref;
    if (!search) return;

    const place = at ?? (drawn as HTMLElement);
    const { location, expression } = place.dataset;

    const own = place.closest<HTMLElement>("[data-component]");
    const holder = place.classList.contains("face")
      ? place.parentElement?.closest<HTMLElement>("[data-component]")
      : undefined;
    const drawnBy = [own, holder].flatMap((host) =>
      host?.dataset.component ? [host.dataset.component] : [],
    );
    const said = own?.dataset.said;
    const ids = JSON.parse(location ?? "[]") as string[];

    const opened = space.open(
      expression ? { gather: JSON.parse(expression) } : ids.length === 1 ? ids[0]! : ids,
      {
        component: search,
        offer: offering,
        settings: {
          pressed: true,
          ...(drawnBy.length ? { drawn: drawnBy.map(($ref) => ({ $ref })) } : {}),
          ...(said ? { said: said.split(" ") } : {}),
        },
      },
    );

    closeMenu?.();
    closeMenu = overlay(event.clientX, event.clientY, opened, element, () => space.close(opened));
  }

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

  return element;
}
