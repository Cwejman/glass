import type { Id } from "../../src/store/id.ts";
import type { Declaration, Given, HolonOf, Space } from "../../src/interface/component.ts";
import type { By, Expression } from "../../src/engine/expression.ts";
import type { ComponentBody, Ref, SearchSettings } from "./bodies.ts";
import { h } from "./jsx.ts";
import { axisWords, partsOf, partWords, titleOf, together, type Parts } from "./parts.ts";

// A search: where one stands, said by what it means, and the bricks to
// build where to look next. Given a way of looking, it says its parts, each
// a meaning that can be let go; given a holon, what it is and what it is
// called. Every form of an expression is a brick: of a type, held by a
// holon, pointing at one, saying some words, kept in a store, named, a
// type, or gathered by one more part, and grouped by an axis; or, which
// joins the next brick to the last as either; and open, which goes to one
// holon. Typing finds the brick; Enter takes it, and what it takes is
// chosen the same way, a type among the types, a holon among those whose
// title says the words. So an intersection grows a part at a time, and an
// expression is built in place.
//
// Before anything is typed it offers what is near: what can be done here,
// given the component a place is drawn by, as look with another component,
// set what that component takes and nothing gave it, keep the way of
// looking on the favorites; then the favorites; then the bricks.
//
// It acts on nothing. Each thing it offers is a press that says where it
// leads, as every location does, and rises to the mount that holds it.

export const declared = {
  title: "Search",
  says: "Where one stands, said by what it means, and the bricks of an expression to build where to look next, part by part, each taken a press that rises to the mount.",
  takes: [],
  kinds: ["full"],
  argument: "selection",
  settings: {
    drawn: {
      says: "The component the place is drawn by where it was pressed, whose settings it offers to set.",
      shape: "ref",
      optional: true,
    },
    said: {
      says: "The settings the place's slot gave already, which no offer reaches, so are not offered to set.",
      shape: { list: "string" },
      optional: true,
    },
    pressed: {
      says: "Whether it was laid where something was pressed: it takes the focus, and offers first what can be done there.",
      shape: "boolean",
      optional: true,
    },
  },
  reads: ["gather", "holon", "instances", "name", "groups"],
} satisfies Declaration;

// What a press leads to: a place, by its holons, drawn as the mount finds
// or by a component; a way of looking; what the mount offers; or a way of
// looking to keep on the favorites.
type Lead =
  | { location: Id[]; component?: Id }
  | { expression: Expression; component?: Id }
  | { offer: Record<string, unknown> }
  | { keep: Expression; title: string };

// A row of what is offered: pressed to go where it leads, or, a brick, to
// take it and choose what it is of.
interface Found {
  label: string;
  meta: string;
  lead?: Lead;
  brick?: Brick;
}

// A brick: a form of expression, said as it reads, and what it is of,
// chosen once it is taken; or, with nothing to choose, where it leads.
interface Brick {
  words: string;
  says: string;
  choose?: (text: string) => Promise<Found[]>;
  leads?: () => Lead;
}

const shown = 8;

export default async function draw(given: Given<never, SearchSettings>, space: Space) {
  const titled = async (id: Id) => String((await space.holon(id))?.body.title ?? id);
  const settings = given.settings;
  const one = given.holon as HolonOf<Record<string, unknown>> | undefined;
  const ids = given.list ?? (one ? [one.id] : []);
  const standing: Parts | undefined = given.gathers ? partsOf(given.gathers) : undefined;
  const [componentType, full] = await Promise.all(["component", "full"].map((name) => space.read({ name })));

  // Where one stands with one more part: beside the others, or, joined, as
  // either it or the last. From a holon, from everything, grouped by what
  // splits it best.
  let joining = false;
  const toward = (parts: Parts): Lead => ({ expression: together(parts) });
  const adding = (part: Expression): Lead => {
    if (!standing) return toward({ parts: [part], by: "strongest" });
    const last = standing.parts.at(-1);
    const parts =
      joining && last
        ? [...standing.parts.slice(0, -1), { any: [...("any" in last ? last.any : [last]), part] }]
        : [...standing.parts, part];
    return toward({ ...standing, parts });
  };

  // The holons whose title says the words, those it begins first; else
  // those whose body says them.
  const holonsSaying = async (text: string) => {
    const words = text.trim().toLocaleLowerCase();
    if (!words) return [];
    const read = (
      await Promise.all(
        (await space.read({ gather: { match: words } })).slice(0, 60).map((id) => space.holon(id)),
      )
    ).filter((holon): holon is NonNullable<typeof holon> => !!holon);
    const rank = (holon: (typeof read)[number]) => {
      const title = String(holon.body.title ?? "").toLocaleLowerCase();
      return title.startsWith(words) ? 0 : words.split(/\s+/).every((word) => title.includes(word)) ? 1 : 2;
    };
    return read.sort((a, b) => rank(a) - rank(b)).slice(0, shown);
  };
  const holonsAs = (part: (id: Id) => Expression) => async (text: string) =>
    Promise.all(
      (await holonsSaying(text)).map(async (holon) => ({
        label: String(holon.body.title ?? holon.id),
        meta: (await Promise.all(holon.instance.map(titled))).join(", "),
        lead: adding(part(holon.id)),
      })),
    );
  const fits = (text: string, label: string) =>
    text
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .every((word) => label.toLocaleLowerCase().includes(word));

  const bricks: Brick[] = [
    {
      words: "of type",
      says: "narrow to the instances of a type",
      choose: async (text) =>
        (await Promise.all((await space.read({ gather: { types: true } })).map((id) => space.holon(id))))
          .filter((type) => !!type && fits(text, String(type.body.title)))
          .map((type) => ({
            label: String(type!.body.title),
            meta: "type",
            lead: adding({ instances: { $ref: type!.id } }),
          })),
    },
    {
      words: "held by",
      says: "narrow to what a holon holds",
      choose: holonsAs((id) => ({ from: { $ref: id } })),
    },
    {
      words: "pointing at",
      says: "narrow to what points at a holon",
      choose: holonsAs((id) => ({ pointing: { $ref: id } })),
    },
    {
      words: "saying",
      says: "narrow to what says some words",
      choose: async (text) =>
        text.trim()
          ? [{ label: `“${text.trim()}”`, meta: "the words", lead: adding({ match: text.trim() }) }]
          : [],
    },
    {
      words: "kept in",
      says: "narrow to what a store keeps",
      choose: async (text) => {
        const stores = await space.read({ groups: { group: { everything: true }, by: "store" } });
        return (stores?.groups ?? [])
          .filter(({ value }) => fits(text, value))
          .map(({ value }) => ({ label: value, meta: "store", lead: adding({ store: value }) }));
      },
    },
    { words: "named", says: "narrow to what a store names", leads: () => adding({ named: true }) },
    { words: "a type", says: "narrow to the types", leads: () => adding({ types: true }) },
    {
      words: "grouped by",
      says: "gather it in collections",
      choose: async (text) =>
        (["strongest", "type", "holder", "store"] as By[])
          .filter((axis) => fits(text, axisWords[axis]))
          .map((axis) => ({
            label: axisWords[axis],
            meta: "grouping",
            lead: toward({ ...(standing ?? { parts: [] }), by: axis }),
          })),
    },
    {
      words: "open",
      says: "go to one holon",
      choose: async (text) =>
        Promise.all(
          (await holonsSaying(text)).map(async (holon) => ({
            label: String(holon.body.title ?? holon.id),
            meta: (await Promise.all(holon.instance.map(titled))).join(", "),
            lead: { location: [holon.id] },
          })),
        ),
    },
  ];
  const or: Brick = { words: "or", says: "join the next brick to the last, as either" };
  // A brick as a row: taken to choose what it is of, or, with nothing to
  // choose, pressed on to where it leads.
  const brickRow = (brick: Brick): Found =>
    brick.leads
      ? { label: brick.words, meta: brick.says, lead: brick.leads() }
      : { label: brick.words, meta: brick.says, brick };

  // Where one stands: each part a chip, pressed to let it go; a holon, by
  // its types, each a way to its kind, and its title, let go for
  // everything; a list, by how many.
  const chips = standing
    ? [
        ...(await Promise.all(
          standing.parts.map(async (part, i) =>
            chip(
              await partWords(part, titled),
              toward({ ...standing, parts: standing.parts.filter((_, j) => j !== i) }),
            ),
          ),
        )),
        ...(standing.by ? [chip(axisWords[standing.by], toward({ parts: standing.parts }), "by")] : []),
      ]
    : one
      ? [
          ...(await Promise.all(
            one.instance.map(async (type) =>
              place(await titled(type), toward({ parts: [{ instances: { $ref: type } }], by: "strongest" })),
            ),
          )),
          chip(String(one.body.title ?? one.id), toward({ parts: [], by: "strongest" })),
        ]
      : [
          chip(
            ids.length === 1 ? "one holon" : `${ids.length} holons`,
            toward({ parts: [], by: "strongest" }),
          ),
        ];

  const favorites = ((given.offered.favorites ?? []) as Ref[]).map(({ $ref }) => $ref);

  // What is near, before anything is typed.
  const near = async (): Promise<Found[]> => {
    const found: Found[] = [];
    if (settings.pressed) found.push(...(await doable()));
    // A favorite no longer in the field is passed by.
    for (const id of favorites) {
      const favorite = await space.holon(id);
      if (favorite)
        found.push({ label: String(favorite.body.title ?? id), meta: "favorite", lead: { location: [id] } });
    }
    return found;
  };

  // What can be done where the search was laid: look with another
  // component, set what the component there takes and nothing gave it,
  // keep the way of looking, or place the holon on the favorites or take
  // it off.
  const doable = async (): Promise<Found[]> => {
    const found: Found[] = [];
    const drawn = settings.drawn ? await space.holon<ComponentBody>(settings.drawn.$ref) : null;
    const searching = (given.offered.search as Ref | undefined)?.$ref;
    const here = (component?: Id): Lead =>
      given.gathers ? { expression: given.gathers, component } : { location: ids, component };
    found.push({ label: "Look here", meta: "go", lead: here() });
    for (const other of await drawers())
      if (other.id !== drawn?.id && other.id !== searching)
        found.push({
          label: `Look here with ${other.body.title}`,
          meta: "component",
          lead: here(other.id),
        });
    const declaredSettings = (drawn?.body.settings ?? {}) as Record<string, { says: string; shape: unknown }>;
    if (drawn && drawn.id !== searching)
      for (const [key, setting] of Object.entries(declaredSettings))
        if (setting.shape === "boolean" && !(settings.said ?? []).includes(key)) {
          const now = given.offered[key] === true;
          found.push({
            label: `${capital(key)}: ${now ? "on, turn off" : "off, turn on"}`,
            meta: `${drawn.body.title}: ${setting.says}`,
            lead: { offer: { [key]: !now } },
          });
        }
    if (given.gathers)
      found.push({
        label: "Keep on the favorites",
        meta: "favorites",
        lead: { keep: given.gathers, title: await titleOf(given.gathers, titled) },
      });
    else if (one) {
      const placed = favorites.includes(one.id);
      found.push({
        label: placed ? "Take off the favorites" : "Place on the favorites",
        meta: "favorites",
        lead: {
          offer: {
            favorites: (placed ? favorites.filter((id) => id !== one.id) : [...favorites, one.id]).map(
              ($ref) => ({ $ref }),
            ),
          },
        },
      });
    }
    return found;
  };

  // The components that can draw this place in full.
  const drawers = async () => {
    if (!componentType || !full) return [];
    const all = await Promise.all(
      (await space.read({ instances: componentType })).map((id) => space.holon<ComponentBody>(id)),
    );
    const takes = (argument = "holon") =>
      given.gathers
        ? ["expression", "list", "selection"].includes(argument)
        : argument === "selection" || argument === (one ? "holon" : "list");
    return all.filter(
      (component): component is HolonOf<ComponentBody> =>
        !!component &&
        component.body.kinds.some(({ $ref }) => $ref === full) &&
        takes(component.body.argument) &&
        (component.body.takes.length === 0 ||
          (!!one && component.body.takes.some(({ $ref }) => one.instance.includes($ref)))),
    );
  };

  // What the words find, with no brick taken: the bricks they name, what
  // near they name, and, always, to narrow by the words themselves.
  const search = async (text: string): Promise<Found[]> => {
    const said = text.trim();
    return [
      ...[...bricks, ...(standing?.parts.length ? [or] : [])]
        .filter(({ words }) => fits(said, words))
        .map(brickRow),
      ...(await near()).filter(({ label }) => fits(said, label)),
      { label: `saying “${said}”`, meta: "narrow by the words", lead: adding({ match: said }) },
    ];
  };

  // The brick taken, waiting for what it is of.
  let taken: Brick | undefined;
  const input = (
    <input class="search-input" type="search" role="combobox" aria-autocomplete="list" spellcheck="false" />
  ) as HTMLInputElement;
  const pending = (<span class="part pending" />) as HTMLElement;
  const listed = (<ul class="search-found" role="listbox" />) as HTMLElement;
  const element = (
    <div class={settings.pressed ? "search pressed" : "search"}>
      <div class="search-field">
        {chips}
        {pending}
        {input}
      </div>
      {listed}
    </div>
  ) as HTMLElement;

  const said = () => {
    pending.textContent = [joining ? "or" : "", taken?.words ?? ""].filter(Boolean).join(" ");
    pending.hidden = !pending.textContent;
    input.placeholder = taken
      ? `choose what it is ${taken.words}`
      : standing || !one
        ? "type a brick: of type, held by, saying, grouped by, or, open…"
        : "type a brick to look from here: of type, held by, saying, open…";
  };

  // What was found, each a row, pressed to go where it leads or to take
  // the brick. The first is where Enter goes.
  let active = 0;
  const rows = () => [...listed.querySelectorAll<HTMLElement>(".found")];
  const mark = (at: number) => {
    const all = rows();
    active = all.length ? (at + all.length) % all.length : 0;
    all.forEach((row, i) => row.classList.toggle("active", i === active));
    all[active]?.scrollIntoView({ block: "nearest" });
  };
  const show = (found: Found[]) => {
    listed.replaceChildren(
      ...found.map((row) => (
        <li class="found" role="option">
          {row.brick ? (
            <button type="button" class="lead" onClick={() => take(row.brick!)}>
              <span class="found-label">{row.label}</span>
              <span class="meta">{row.meta}</span>
            </button>
          ) : (
            press(
              row.lead!,
              <span class="found-label">{row.label}</span>,
              <span class="meta">{row.meta}</span>,
            )
          )}
        </li>
      )),
    );
    mark(0);
  };

  let asked = 0;
  let asking: Promise<void> = Promise.resolve();
  const ask = async () => {
    const turn = ++asked;
    const text = input.value;
    const found = taken
      ? await taken.choose!(text)
      : text.trim()
        ? await search(text)
        : [...(await near()), ...[...bricks, ...(standing?.parts.length ? [or] : [])].map(brickRow)];
    if (turn === asked) show(found);
  };
  const again = () => void (asking = ask().catch((error: unknown) => console.error(error)));

  // A brick taken: or waits for the next, and one with something to choose
  // waits for it.
  function take(brick: Brick) {
    input.value = "";
    if (brick === or) joining = true;
    else taken = brick;
    said();
    again();
    input.focus();
  }

  input.addEventListener("input", again);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") return (event.preventDefault(), mark(active + 1));
    if (event.key === "ArrowUp") return (event.preventDefault(), mark(active - 1));
    // Enter goes where the first row leads, once what was typed is found.
    if (event.key === "Enter") {
      event.preventDefault();
      return void asking.then(() => rows()[active]?.querySelector<HTMLElement>(".lead")?.click());
    }
    // Letting go of the brick taken, else of or, else of the last part, as
    // a word is let go; the grouping is let go of by its own chip.
    if (event.key === "Backspace" && input.value === "") {
      if (taken || joining) {
        event.preventDefault();
        if (taken) taken = undefined;
        else joining = false;
        said();
        return again();
      }
      [...element.querySelectorAll<HTMLElement>(".part:not(.by) > .let-go")].at(-1)?.click();
    }
  });

  said();
  await ask();
  if (settings.pressed) setTimeout(() => input.focus());
  return element;
}

// A press that leads somewhere.
function press(lead: Lead, ...children: unknown[]) {
  return (
    <button type="button" class="lead" {...attributes(lead)}>
      {children}
    </button>
  );
}

// A part of where one stands, pressed to let it go.
function chip(label: string, without: Lead, kind = "") {
  return (
    <span class={kind ? `part ${kind}` : "part"}>
      {label}
      <button type="button" class="let-go" aria-label={`Let go of ${label}`} {...attributes(without)}>
        ×
      </button>
    </span>
  );
}

// A way where one stands is reached from, pressed to go there.
function place(label: string, lead: Lead) {
  return (
    <button type="button" class="part" {...attributes(lead)}>
      {label}
    </button>
  );
}

// Where a press leads, said as the mount reads it.
function attributes(lead: Lead) {
  if ("expression" in lead)
    return {
      "data-expression": JSON.stringify(lead.expression),
      ...(lead.component ? { "data-calls": lead.component } : {}),
    };
  if ("offer" in lead) return { "data-offer": JSON.stringify(lead.offer) };
  if ("keep" in lead) return { "data-keep": JSON.stringify(lead.keep), "data-title": lead.title };
  return {
    "data-location": JSON.stringify(lead.location),
    ...(lead.component ? { "data-calls": lead.component } : {}),
  };
}

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
