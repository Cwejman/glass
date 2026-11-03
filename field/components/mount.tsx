import type { Id } from "../../src/store/id.ts";
import type { Declaration, Given, Space } from "../../src/interface/component.ts";
import type { ComponentBody, MountBody } from "./bodies.ts";
import { h } from "./jsx.ts";
import { ask, offer, type Action } from "./menu.ts";

// A mount: what it gives, drawn in full by the component it calls. A mount
// that may be written is where what one looks at can change: a press
// anywhere inside it rises to it with the place it landed on, the innermost
// location it passed, and the mount gives that instead, a new version of
// itself. On the secondary press it offers what can be done there: to look
// there, to look there with each component that takes it, or to change what
// it gives by hand. A mount that may not be written lets a press rise on.

export const declared = {
  title: "Mount",
  says: "A mount: what it gives, drawn by the component it calls; where it may be written, a press inside it moves it to the place pressed, and its menu offers what takes that place.",
  takes: ["mount"],
  kinds: ["full", "face"],
  reads: ["name", "instances", "holon"],
} satisfies Declaration;

export default function draw(given: Given<MountBody>, space: Space) {
  const mount = given.holon!;
  const { title, component, argument } = mount.body;
  const giving = argument.map(({ $ref }) => $ref);

  if (given.kind === "face")
    return (
      <div class="card">
        <strong>{title ?? "A mount"}</strong>
        <span class="meta">gives {giving.length === 1 ? "one holon" : `${giving.length} holons`}</span>
      </div>
    );

  const drawn = space.open(giving.length === 1 ? giving[0]! : giving, {
    offer: { kind: "full" },
    ...(component ? { component: component.$ref } : {}),
  });
  if (!given.may.write) return <div class="mount">{drawn}</div>;

  const element = (<div class="mount" />) as HTMLElement;
  let full: ReturnType<typeof drawingFull> | undefined;

  // A component chosen from the menu is for that one look: a plain move
  // calls again what the entry calls, the reader.
  const plainly = async () => {
    const entry = await space.read({ name: "entry" });
    return entry ? (await space.holon<MountBody>(entry))?.body.component?.$ref : undefined;
  };

  const give = async (ids: Id[], by?: Id) => {
    const calls = by ?? (await plainly());
    const { component: _, ...rest } = mount.body;
    await space.write({
      ...rest,
      argument: ids.map(($ref) => ({ $ref })),
      ...(calls ? { component: { $ref: calls } } : {}),
    });
  };
  const same = (ids: Id[]) => JSON.stringify(ids) === JSON.stringify(giving);

  // The innermost location a press passed, inside this mount.
  const pressedAt = (event: Event) => {
    const at = (event.target as Element).closest<HTMLElement>("[data-location]");
    return at && element.contains(at) ? at : null;
  };

  const press = (event: Event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (link && !link.dataset.location) return;
    const at = pressedAt(event);
    if (!at) return;
    event.preventDefault();
    event.stopPropagation();
    const ids = JSON.parse(at.dataset.location!) as Id[];
    if (!same(ids)) give(ids).catch((error: unknown) => console.error(error));
  };

  element.addEventListener("click", press);
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!(event.target as HTMLElement).dataset.location) return;
    press(event);
  });
  element.addEventListener("contextmenu", (event) => {
    if (event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    void menu(event, pressedAt(event));
  });

  // What can be done where the press landed: look there, look there with
  // each component that takes it, or change what the mount gives by hand.
  async function menu(event: MouseEvent, at: HTMLElement | null) {
    const ids = at ? (JSON.parse(at.dataset.location!) as Id[]) : giving;
    const types = (at?.dataset.instance ?? "").split(" ").filter(Boolean);
    const actions: Action[] = [];
    if (!same(ids)) actions.push({ label: "Look here", run: () => give(ids) });

    for (const other of taking(await (full ??= drawingFull(space)), ids, types))
      if (!same(ids) || other.id !== component?.$ref)
        actions.push({ label: `Look here with ${other.body.title}`, run: () => give(ids, other.id) });

    actions.push({
      label: "Change what it gives",
      run: () =>
        ask(
          event.clientX,
          event.clientY,
          "What it gives",
          JSON.stringify({ component: mount.body.component, argument: mount.body.argument }, null, 2),
          async (value) => {
            const { component: by, argument: given } = JSON.parse(value) as Partial<MountBody>;
            const { component: _, ...rest } = mount.body;
            await space.write({ ...rest, ...(by ? { component: by } : {}), argument: given ?? [] });
          },
          element,
        ),
    });
    offer(event.clientX, event.clientY, title ?? "This mount", actions, element);
  }

  element.append(drawn);
  return element;
}

// The components that draw in full, read once for a drawing however often
// its menu is asked for.
async function drawingFull(space: Space) {
  const componentType = await space.read({ name: "component" });
  const full = await space.read({ name: "full" });
  if (!componentType || !full) return [];
  const all = await Promise.all(
    (await space.read({ instances: componentType })).map((id) => space.holon<ComponentBody>(id)),
  );
  return all.filter(
    (component): component is NonNullable<typeof component> =>
      !!component && component.body.kinds.some(({ $ref }) => $ref === full),
  );
}

// Those that can draw a place: that take one of the types of the holon
// there, or that take any, and are given one holon, or several, as the
// place is.
function taking(all: Awaited<ReturnType<typeof drawingFull>>, ids: Id[], types: Id[]) {
  const fits = (given = "holon") => given === "selection" || given === (ids.length === 1 ? "holon" : "list");
  return all.filter(
    (component) =>
      fits(component.body.argument) &&
      (component.body.takes.length === 0 || component.body.takes.some(({ $ref }) => types.includes($ref))),
  );
}
