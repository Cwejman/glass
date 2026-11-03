import { newId, type Id } from "../../src/store/id.ts";
import type { Declaration, Given, Made, Space } from "../../src/interface/component.ts";
import type { ComponentBody, MountBody } from "./bodies.ts";
import { h } from "./jsx.ts";
import { ask, offer, type Action } from "./menu.ts";
import { expressionProblem } from "../../src/engine/expression.ts";
import { words } from "./words.ts";

// A mount: where it is, its location said in words above, and what it
// gives, drawn in full by the component it calls. A mount that may be
// written is where what one looks at can change: a press anywhere inside it
// rises to it with the place it landed on, the innermost location it
// passed, and the mount gives that instead, a new version of itself. Its
// location can be changed where it is said: to a way of looking the field
// holds, to one written there and kept in the home, or to a holon by its
// name. On the secondary press it offers what can be done there: to look
// there, to look there with each component that takes it, or to change what
// it gives by hand. A mount that may not be written lets a press rise on.

export const declared = {
  title: "Mount",
  says: "A mount: its location in words, and what it gives, drawn by the component it calls; where it may be written, its location can be changed where it is said, a press inside it moves it to the place pressed, and its menu offers what takes that place.",
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
  const said = await Promise.all(giving.map((id) => saidOf(id, space)));
  if (!given.may.write)
    return (
      <div class="mount">
        <p class="location">{said.join("; ")}</p>
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

  // Where the mount is, said; pressed, it opens to be changed.
  const location = (
    <button type="button" class="location" title="Change where you are looking">
      {said.join("; ")}
    </button>
  ) as HTMLElement;
  location.addEventListener("click", (event) => {
    event.stopPropagation();
    void change(location, space, same, (ids, made) => give(ids, undefined, made));
  });

  element.append(location, drawn);
  return element;
}

// A holon said as where one is: a way of looking by what it gathers, and
// anything else by its title and what it is.
async function saidOf(id: Id, space: Space): Promise<string> {
  const holon = await space.holon(id);
  if (!holon) return id;
  const titleOf = async (of: Id) => String((await space.holon(of))?.body.title ?? of);
  const expression = await space.read({ name: "expression" });
  if (expression && holon.instance.includes(expression)) {
    const title = String(holon.body.title);
    const said = await words(holon.body.gathers as never, titleOf);
    return said.toLowerCase() === title.toLowerCase() ? title : `${title}: ${said}`;
  }
  const types = await Promise.all(holon.instance.map(titleOf));
  return `${String(holon.body.title ?? holon.id)} · ${types.join(", ")}`;
}

// Changing where one looks, in the place where it is said: each way of
// looking the field holds, to choose; or words to give, a name the field
// gives, or an expression written as data, its holons by their names, as
// `{ "instances": "brief" }`, kept in the home as a way of looking of its
// own. Escape leaves it as it was.
async function change(
  location: HTMLElement,
  space: Space,
  same: (ids: Id[]) => boolean,
  give: (ids: Id[], made?: Made[]) => Promise<void>,
) {
  const expression = await space.read({ name: "expression" });
  const ways = expression ? await space.read({ instances: expression }) : [];
  const titled = await Promise.all(
    ways.map(async (id) => {
      const way = await space.holon(id);
      return { id, title: String(way?.body.title ?? id), gathers: JSON.stringify(way?.body.gathers) };
    }),
  );

  const input = (
    <input class="location-input" placeholder='a name, or an expression, as { "instances": "brief" }' />
  ) as HTMLInputElement;
  const said = (<p class="location-said" role="status" />) as HTMLElement;
  const editor = (
    <div class="location-edit">
      <div class="location-ways">
        {titled.map(({ id, title }) => (
          <button type="button" onClick={() => void kept(() => go([id]))}>
            {title}
          </button>
        ))}
      </div>
      {input}
      {said}
    </div>
  ) as HTMLElement;

  const back = () => editor.replaceWith(location);
  // Where one already is, one stays, with no step in the history.
  const go = (ids: Id[], made?: Made[]) => (same(ids) ? Promise.resolve(back()) : give(ids, made));
  async function kept(move: () => Promise<void>) {
    try {
      await move();
    } catch (error) {
      said.textContent = error instanceof Error ? error.message : String(error);
    }
  }
  editor.addEventListener("click", (event) => event.stopPropagation());
  editor.addEventListener("keydown", (event) => {
    if (event.key === "Escape") return back();
    if (event.key === "Enter" && event.target === input)
      void kept(async () => {
        const where = await whereOf(input.value.trim(), space, expression, titled);
        await go([where.id], where.made);
      });
  });

  location.replaceWith(editor);
  input.focus();
}

// Where words lead: an expression written as data, the way of looking the
// field holds that gathers so, or else brought into being as one in the
// home; or a holon by the name the field gives it.
async function whereOf(
  written: string,
  space: Space,
  expression: Id | null,
  ways: { id: Id; gathers: string }[],
): Promise<{ id: Id; made?: Made[] }> {
  if (!written.startsWith("{")) {
    const named = await space.read({ name: written });
    if (named) return { id: named };
    throw new Error(`nothing in the field is named ${written}`);
  }
  if (!expression) throw new Error("the field holds no type for expressions");
  const gathers = await byName(JSON.parse(written) as unknown, space);
  const wrong = expressionProblem(gathers as never);
  if (wrong) throw new Error(`that is not a way of looking: ${wrong}`);
  // A way of looking the field already holds is looked through again.
  const held = ways.find((way) => way.gathers === JSON.stringify(gathers));
  if (held) return { id: held.id };
  const titleOf = async (of: Id) => String((await space.holon(of))?.body.title ?? of);
  const title = await words(gathers as never, titleOf);
  const id = newId();
  const body = { title: title[0]!.toUpperCase() + title.slice(1), gathers: gathers as never };
  return { id, made: [{ id, instance: expression, body }] };
}

// An expression whose holons are given by name, each made a reference to
// the holon it names, so it points into the field as any value does.
async function byName(value: unknown, space: Space): Promise<unknown> {
  if (Array.isArray(value)) return Promise.all(value.map((inner) => byName(inner, space)));
  if (value === null || typeof value !== "object") return value;
  const entries = await Promise.all(
    Object.entries(value).map(async ([key, inner]) => {
      if ((key === "instances" || key === "pointing") && typeof inner === "string") {
        const named = await space.read({ name: inner });
        if (!named) throw new Error(`nothing in the field is named ${inner}`);
        return [key, { $ref: named }];
      }
      return [key, await byName(inner, space)];
    }),
  );
  return Object.fromEntries(entries);
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
