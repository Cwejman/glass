import { canonical } from "../../src/store/canonical.ts";
import { newId, type Id } from "../../src/store/id.ts";
import type { Declaration, Given, Made, Space } from "../../src/interface/component.ts";
import type { By, Expression } from "../../src/engine/expression.ts";
import type { ComponentBody, ExpressionBody, MountBody } from "./bodies.ts";
import { h } from "./jsx.ts";
import { ask, offer, type Action } from "./menu.ts";
import { axisWords } from "./words.ts";

// A mount: where it is, said above as the way walked to it, and what it
// gives, drawn in full by the component it calls. A mount that may be
// written is where what one looks at can change: a press anywhere inside it
// rises to it with the place it landed on, the innermost location it
// passed, a holon or a way of looking, and the mount gives that instead, a
// new version of itself. The way above is made of such places too: each
// step a way of looking to go back to, and the axes the last is grouped by,
// each a way of looking beside it. A way of looking the field does not yet
// hold is born in the home as the mount moves to it. On the secondary press
// it offers what can be done there: to look there, to look there with each
// component that takes it, or to change what it gives by hand. A mount
// that may not be written lets a press rise on.

export const declared = {
  title: "Mount",
  says: "A mount: the way walked to where it is, and what it gives, drawn by the component it calls; where it may be written, a press inside it, on the way or on what it gives, moves it to the place pressed, and its menu offers what takes that place.",
  takes: ["mount"],
  kinds: ["full", "face"],
  reads: ["name", "instances", "holon"],
} satisfies Declaration;

export default async function draw(given: Given<MountBody>, space: Space) {
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
  const way = await wayTo(giving, space);
  if (!given.may.write)
    return (
      <div class="mount">
        {way}
        {drawn}
      </div>
    );

  const element = (<div class="mount" />) as HTMLElement;
  let full: ReturnType<typeof drawingFull> | undefined;

  // A component chosen from the menu is for that one look: a plain move
  // calls again what the entry calls, the reader.
  const plainly = async () => {
    const entry = await space.read({ name: "entry" });
    return entry ? (await space.holon<MountBody>(entry))?.body.component?.$ref : undefined;
  };

  const give = async (ids: Id[], by?: Id, made: Made[] = []) => {
    const calls = by ?? (await plainly());
    const { component: _, ...rest } = mount.body;
    await space.write(
      { ...rest, argument: ids.map(($ref) => ({ $ref })), ...(calls ? { component: { $ref: calls } } : {}) },
      made,
    );
  };
  const same = (ids: Id[]) => JSON.stringify(ids) === JSON.stringify(giving);

  // A way of looking, as a place to go: the one the field holds that
  // gathers so, or else one born in the home as the mount moves to it.
  const look = async (gathers: Expression, title: string) => {
    const held = await heldWay(gathers, space);
    if (held) return same([held]) ? undefined : give([held]);
    const expression = await space.read({ name: "expression" });
    if (!expression) throw new Error("the field holds no type for ways of looking");
    const id = newId();
    return give([id], undefined, [{ id, instance: expression, body: { title, gathers } as never }]);
  };

  // The innermost place a press passed, inside this mount: a holon, or a
  // way of looking.
  const pressedAt = (event: Event) => {
    const at = (event.target as Element).closest<HTMLElement>("[data-location], [data-expression]");
    return at && element.contains(at) ? at : null;
  };
  const go = (at: HTMLElement) => {
    if (at.dataset.expression)
      return look(JSON.parse(at.dataset.expression) as Expression, at.dataset.title ?? "A way of looking");
    const ids = JSON.parse(at.dataset.location!) as Id[];
    return same(ids) ? undefined : give(ids);
  };

  const press = (event: Event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (link && !link.dataset.location) return;
    const at = pressedAt(event);
    if (!at) return;
    event.preventDefault();
    event.stopPropagation();
    Promise.resolve(go(at)).catch((error: unknown) => console.error(error));
  };

  element.addEventListener("click", press);
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as HTMLElement;
    if (!target.dataset.location && !target.dataset.expression) return;
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
    if (at?.dataset.expression)
      return offer(
        event.clientX,
        event.clientY,
        at.dataset.title ?? "A way of looking",
        [{ label: "Look here", run: async () => void (await go(at)) }],
        element,
      );
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

  element.append(way, drawn);
  return element;
}

// The way walked to where one looks, said as places: everything first,
// then each step a way of looking was narrowed by, then the axes the last
// is grouped by, the one it is grouped by marked. A holon is reached from
// what it is. Each step and axis is a way of looking, pressed to go there.
async function wayTo(giving: Id[], space: Space) {
  const titleOf = async (id: Id) => String((await space.holon(id))?.body.title ?? id);
  // A step, said by its label, and titled by the whole of where it leads.
  const step = (gathers: Expression, label: string, here = false, title = label) => (
    <button
      type="button"
      class={here ? "step here" : "step"}
      data-expression={JSON.stringify(gathers)}
      data-title={title}
    >
      {label}
    </button>
  );
  const everything = step(grouped([]), "Everything");

  const one = giving.length === 1 ? await space.holon(giving[0]!) : null;
  const expression = await space.read({ name: "expression" });
  if (!one || !expression || !one.instance.includes(expression)) {
    const kinds = one
      ? await Promise.all(
          one.instance.map(async (type) =>
            step(grouped([{ instances: { $ref: type } }]), await titleOf(type)),
          ),
        )
      : [];
    return (
      <nav class="location">
        {everything}
        {kinds}
        <span class="step here">
          {one
            ? String(one.body.title ?? one.id)
            : giving.length === 1
              ? "what stood here is no longer in the field"
              : `${giving.length} holons`}
        </span>
      </nav>
    );
  }

  const { parts, by } = stepsOf((one.body as unknown as ExpressionBody).gathers);
  const said = await Promise.all(parts.map((part) => partTitle(part, titleOf)));
  const steps = parts.map((_, i) =>
    step(grouped(parts.slice(0, i + 1)), said[i]!, !by && i === parts.length - 1),
  );
  const axes = by
    ? (Object.keys(axisWords) as By[]).map((axis) =>
        step(
          { group: whole(parts), by: axis },
          axisWords[axis],
          axis === by,
          `${said.at(-1) ?? "Everything"}, ${axisWords[axis]}`,
        ),
      )
    : [];
  return (
    <nav class="location">
      {step(grouped([]), "Everything", parts.length === 0 && !by)}
      {steps}
      {axes.length > 0 && <span class="axes">{axes}</span>}
    </nav>
  );
}

// A way of looking taken apart into the steps it narrows by, and the axis
// it is grouped by, if it is grouped.
function stepsOf(gathers: Expression): { parts: Expression[]; by?: By } {
  const by = "group" in gathers ? gathers.by : undefined;
  const inner = "group" in gathers ? gathers.group : gathers;
  const flat = (e: Expression): Expression[] =>
    "all" in e ? e.all.flatMap(flat) : "everything" in e ? [] : [e];
  return { parts: flat(inner), ...(by ? { by } : {}) };
}

// The steps put together again, and grouped by what splits them best.
const whole = (parts: Expression[]): Expression =>
  parts.length === 0 ? { everything: true } : parts.length === 1 ? parts[0]! : { all: parts };
const grouped = (parts: Expression[]): Expression => ({ group: whole(parts), by: "strongest" });

// A step said by what it narrows to.
async function partTitle(part: Expression, titleOf: (id: Id) => Promise<string>) {
  const idOf = (given: Id | { $ref: Id }) => (typeof given === "string" ? given : given.$ref);
  if ("instances" in part) return titleOf(idOf(part.instances));
  if ("from" in part) return titleOf(idOf(part.from));
  if ("pointing" in part) return `pointing at ${await titleOf(idOf(part.pointing))}`;
  if ("store" in part) return part.store;
  if ("named" in part) return "Named";
  if ("types" in part) return "Types";
  return "A way of looking";
}

// The way of looking the field holds that gathers so, if it holds one,
// each told by its canonical form, as the store keeps it.
async function heldWay(gathers: Expression, space: Space): Promise<Id | undefined> {
  const expression = await space.read({ name: "expression" });
  if (!expression) return undefined;
  for (const id of await space.read({ instances: expression })) {
    const way = await space.holon<ExpressionBody>(id);
    if (way && canonical(way.body.gathers) === canonical(gathers)) return id;
  }
  return undefined;
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
