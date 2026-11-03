import type { Id } from "../../src/store/id.ts";
import type { Declaration, Given, HolonOf, Space } from "../../src/interface/component.ts";
import type { Argument, By, Expression } from "../../src/engine/expression.ts";
import { canonical } from "../../src/store/canonical.ts";
import type { ComponentBody, Ref, SearchSettings } from "./bodies.ts";
import { h } from "./jsx.ts";
import {
  call,
  holonsOf,
  native,
  partSaid,
  partsOf,
  programsIn,
  titleOf,
  together,
  type Called,
  type Parts,
} from "./parts.ts";

// A search: where one stands, said by what it means, and the programs to
// build where to look next. Given an expression, it says its parts, each a
// program and what it is given, as Type: Brief, pressed to change it or let
// go; given a holon, what it is and what it is called.
//
// Every program the field holds is a brick, glass's own and one's own
// alike, offered by its title. Typing finds the brick, Enter takes it, and
// what it takes is chosen in turn: a set among what is in view, the types
// and parents of what one is looking at, each with how many it
// holds, or among the holons whose title says what is typed, or built of
// another brick taken within it, so Not: Children of: Type: Brief is built
// as it reads; words as they are typed; an axis to group by. Once all it
// takes is given, it stands as one more part beside the others; a part
// given holons is given another by pressing it and choosing a second, as
// Type: Brief or Component, and Or builds an either of any parts. Open goes to one holon. Typed with no brick
// taken, the words find the values in view as well, as Type: Brief.
//
// Before anything is typed it offers what is near: what can be done here,
// given the component a place is drawn by, as look with another component,
// set what that component takes and nothing gave it, keep the way of
// looking as a program of one's own on the favorites; then the favorites;
// then the bricks.
//
// It acts on nothing. Each thing it offers that leads somewhere is a press
// that says where, as every location does, and rises to the mount that
// holds it.

export const declared = {
  title: "Search",
  says: "Where one stands, said by what it means, and the field's programs as bricks to build where to look next, each built expression a press that rises to the mount.",
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
// or by a component; an expression; what the mount offers; or an
// expression to keep on the favorites.
type Lead =
  | { location: Id[]; component?: Id }
  | { expression: Expression; component?: Id }
  | { offer: Record<string, unknown> }
  | { keep: Expression; title: string };

// A row of what is offered: pressed to go where it leads, or to take a
// step in building it; with neither, it only says something.
interface Found {
  label: string;
  meta: string;
  lead?: Lead;
  step?: () => void;
}

// A program being given what it takes, one argument after another; Open
// is taken as one, given a holon to go to.
interface Frame {
  program: Called;
  given: Argument[];
}
const opening: Called = { id: "", title: "Open", takes: ["holon"] };

const shown = 8;

export default async function draw(given: Given<never, SearchSettings>, space: Space) {
  const titled = async (id: Id) => String((await space.holon(id))?.body.title ?? id);
  const settings = given.settings;
  const one = given.holon as HolonOf<Record<string, unknown>> | undefined;
  const ids = given.list ?? (one ? [one.id] : []);
  const programs = await programsIn({
    name: () => space.read({ name: "program" }),
    instances: (type) => space.read({ instances: type }),
    holon: (id) => space.holon(id),
  });
  const is = (name: string) => native(programs, name);
  const standing: Parts | undefined = given.gathers ? partsOf(programs, given.gathers) : undefined;
  const [componentType, full] = await Promise.all(["component", "full"].map((name) => space.read({ name })));

  // What is being built: the programs taken and what each is given so far,
  // and which part it changes, if it changes one.
  let frames: Frame[] = [];
  let changing: number | undefined;

  const toward = (parts: Parts): Lead => ({ expression: together(programs, parts) });
  const same = (a: Argument, b: Argument) => canonical(a) === canonical(b);

  // A part changed to another: the same program given one holon more, or
  // one fewer, where both are given holons; let go when none is left; else
  // the other part instead.
  const changed = (was: Expression, part: Expression): Expression[] => {
    const before =
      "call" in was && "call" in part && was.call.$ref === part.call.$ref ? (was.with ?? []) : [];
    const had = before.length === 1 ? holonsOf(programs, before[0]) : undefined;
    const now = "call" in part && part.with?.length === 1 ? holonsOf(programs, part.with[0]) : undefined;
    if (!had || now?.length !== 1) return [part];
    const kept = had.some((each) => same(each, now[0]!))
      ? had.filter((each) => !same(each, now[0]!))
      : [...had, now[0]!];
    const program = programs.get((part as { call: { $ref: Id } }).call.$ref)!;
    if (kept.length === 0) return [];
    return [call(program, kept.length === 1 ? kept[0]! : call(is("or"), ...kept))];
  };
  // Whether a value is one the part being changed is given already.
  const holds = (value: Argument) => {
    const was = changing !== undefined ? standing?.parts[changing] : undefined;
    const given =
      was && "call" in was && was.with?.length === 1 ? holonsOf(programs, was.with[0]) : undefined;
    return !!given?.some((each) => same(each, value));
  };

  // Where one stands with one more part: beside the others; joined, as
  // either it or the last; or in the place of the one being changed. From a
  // holon, from everything, grouped automatically. A grouping changes the
  // axis instead.
  const adding = (part: Expression): Lead => {
    if ("call" in part && part.call.$ref === is("group").id)
      return toward({ parts: standing?.parts ?? [], by: part.with![1] as By });
    if (!standing) return toward({ parts: [part], by: "auto" });
    const parts =
      changing !== undefined
        ? standing.parts.flatMap((each, i) => (i === changing ? changed(each, part) : [each]))
        : [...standing.parts, part];
    return toward({ ...standing, parts });
  };

  // What the part being chosen narrows: where one stands, but the part it
  // takes the place of; from a holon, everything.
  const base = (): Expression => {
    if (!standing) return call(is("everything"));
    return together(programs, { parts: standing.parts.filter((_, i) => i !== changing) });
  };

  // The kind of argument the program being built takes next.
  const needs = (): string | undefined => {
    const frame = frames.at(-1);
    if (!frame) return undefined;
    const { takes } = frame.program;
    return takes[Math.min(frame.given.length, takes.length - 1)];
  };
  const complete = ({ program, given }: Frame) =>
    given.length >= program.takes.length && program.takes.at(-1) !== "sets";
  // What is built once a value is given: the frames as they would stand,
  // and, where every program taken has all it takes, the part made.
  const settled = (value: Argument | undefined, within = frames): { frames: Frame[]; part?: Expression } => {
    // With nothing being built, what is given is the part itself.
    if (!within.length) return { frames: within, ...(value ? { part: value as Expression } : {}) };
    const next = within.map((frame) => ({ ...frame, given: [...frame.given] }));
    // Nothing given closes the program built last, as Done does.
    let giving = value;
    for (;;) {
      const top = next.at(-1)!;
      if (giving !== undefined) {
        top.given.push(giving);
        if (!complete(top)) return { frames: next };
      }
      next.pop();
      const made = call(top.program, ...top.given);
      if (!next.length) return { frames: next, part: made };
      giving = made;
    }
  };
  // A value offered to what is being built: a press that leads where the
  // part made leads, or, where more is to be given, a step.
  const offered = (value: Argument, label: string, meta: string, within = frames): Found => {
    const { frames: next, part } = settled(value, within);
    if (part) return { label, meta, lead: adding(part) };
    return { label, meta, step: () => ((frames = next), again()) };
  };

  // The values in view along an axis, each with how many hold it, the
  // larger first, read once for what they narrow; then those whose title
  // says what is typed, each a value offered, the one the part being
  // changed holds marked.
  const facets = new Map<string, Promise<{ value: string; label: string; count: number }[]>>();
  const valuesIn = (axis: "type" | "parent" | "store") => {
    const key = `${axis} ${canonical(base())}`;
    if (!facets.has(key))
      facets.set(
        key,
        space.read({ groups: together(programs, { parts: [base()], by: axis }) }).then((grouped) =>
          Promise.all(
            (grouped?.groups ?? []).map(async ({ value, count }) => ({
              value,
              count,
              label:
                axis === "store"
                  ? value
                  : String((await space.holon(value))?.body.title ?? "what is no longer in the field"),
            })),
          ),
        ),
      );
    return facets.get(key)!;
  };
  const facet = async (
    axis: "type" | "parent" | "store",
    text: string,
    within = frames,
  ): Promise<Found[]> => {
    const all = await valuesIn(axis);
    if (all.length === 0)
      return [{ label: `Nothing to choose: everything in view has one ${axis}`, meta: "" }];
    const found = all.filter(({ label }) => fits(text, label));
    if (found.length === 0) return [{ label: `No ${axis} in view matches “${text.trim()}”`, meta: "" }];
    return found.slice(0, shown * 2).map(({ value, label, count }) => {
      const given: Argument = axis === "store" ? value : { $ref: value };
      return offered(
        given,
        holds(given) ? `${label} ✓` : label,
        count === 1 ? "1 holon" : `${count} holons`,
        within,
      );
    });
  };

  // The holons whose title says the words, those it begins first; else
  // those whose body says them.
  const holonsSaying = async (text: string) => {
    const words = text.trim();
    if (!words) return [];
    const read = (
      await Promise.all(
        (await space.read({ gather: call(is("text"), words) })).slice(0, 60).map((id) => space.holon(id)),
      )
    ).filter((holon): holon is NonNullable<typeof holon> => !!holon);
    const rank = (holon: (typeof read)[number]) => {
      const title = String(holon.body.title ?? "");
      return begins(words, title) ? 0 : fits(words, title) ? 1 : 2;
    };
    return read.sort((a, b) => rank(a) - rank(b)).slice(0, shown);
  };
  const kinds = async (holon: { instance: Id[] }) =>
    (await Promise.all(holon.instance.map(titled))).join(", ");

  const fits = (text: string, label: string) =>
    text
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .every((word) => label.toLocaleLowerCase().includes(word));
  // Whether a name begins with what is typed, so it is found first.
  const begins = (text: string, label: string) =>
    label.toLocaleLowerCase().startsWith(text.trim().toLocaleLowerCase());

  // The bricks: every program the field holds, glass's own first, as the
  // field orders them. At the top, the parts stand side by side, which is
  // And, and no part at all is Everything; Or is built as any brick is, of
  // the sets it is given; Group by groups what is in view, and Open goes to
  // a holon. Within a brick, And and Everything are programs like any
  // other.
  const unoffered = new Set(["everything", "and"]);
  const brick = (program: Called): Found => {
    const says = String(program.title);
    if (program.takes.length === 0) return offered(call(program), says, "a set of its own");
    return { label: says, meta: `takes ${program.takes.join(", ")}`, step: () => take(program) };
  };
  const bricks = (): Found[] => {
    const within = frames.length > 0;
    const own = [...programs.values()].filter(
      ({ native }) => !native || (native !== "group" && (within || !unoffered.has(native))),
    );
    return [
      ...own.map(brick),
      ...(!within
        ? [
            {
              label: "Group by",
              meta: "gather what is in view into collections",
              step: regroup,
            },
            { label: "Open", meta: "go to one holon", step: () => take(opening) },
          ]
        : []),
    ];
  };

  // What can be chosen for what is being built, as what is typed narrows
  // it: by the kind of argument the program takes next.
  const choices = async (text: string): Promise<Found[]> => {
    const frame = frames.at(-1)!;
    const kind = needs();
    if (kind === "holon")
      return Promise.all(
        (await holonsSaying(text)).map(async (holon) => ({
          label: String(holon.body.title ?? holon.id),
          meta: await kinds(holon),
          lead: { location: [holon.id] },
        })),
      );
    if (kind === "words") return text.trim() ? [offered(text.trim(), text.trim(), "contains each word")] : [];
    if (kind === "store") return facet("store", text);
    if (kind === "axis")
      return (["auto", "type", "parent", "store"] as By[])
        .filter((axis) => fits(text, axis))
        .map((axis) =>
          offered(
            axis,
            axis,
            axis === "auto" ? "whichever splits it best" : `one collection for each ${axis}`,
          ),
        );
    // A set: what is in view, for a type or a parent; else the holons whose
    // title says what is typed; and every brick, to build it of.
    const values =
      frame.program.native === "type"
        ? await facet("type", text)
        : frame.program.native === "children"
          ? await facet("parent", text)
          : await Promise.all(
              (await holonsSaying(text)).map(async (holon) =>
                offered({ $ref: holon.id }, String(holon.body.title ?? holon.id), await kinds(holon)),
              ),
            );
    const enough = frame.program.takes.at(-1) === "sets" && frame.given.length >= frame.program.takes.length;
    // The bricks the words name come first, so a brick is built rather
    // than its own holon chosen.
    const named = bricks()
      .filter(({ label }) => fits(text, label))
      .sort((a, b) => Number(begins(text, b.label)) - Number(begins(text, a.label)));
    // Done, where enough sets are given, first while nothing is typed, else
    // after what the words find.
    const done = enough ? [settledRow()] : [];
    return text.trim() ? [...named, ...values, ...done] : [...done, ...values, ...named];
  };
  // Enough sets given: the program as it stands.
  const settledRow = (): Found => {
    const { frames: next, part } = settled(undefined);
    return part
      ? { label: "Done", meta: "with the sets given", lead: adding(part) }
      : { label: "Done", meta: "with the sets given", step: () => ((frames = next), again()) };
  };

  // What a part changed starts from: a program of any number of sets, the
  // sets it is given; any other, nothing.
  const sets = (program: Called, part: Expression): Argument[] =>
    program.takes.at(-1) === "sets" && "call" in part ? [...(part.with ?? [])] : [];

  // Where one stands: each part a chip, its field and value, pressed to
  // change it or let go; a holon, by its types, each a way to its kind, and
  // its title, let go for everything; a list, by how many.
  // Laid where something was pressed, the search changes nothing of the
  // place it was given, for the place is drawn, not held: its parts are
  // said, not changed or let go, and what is built from them is looked at
  // instead, from here.
  const letGo = (lead: Lead) => (settings.pressed ? undefined : lead);
  const changeBy = (change: (() => void) | undefined) => (settings.pressed ? undefined : change);
  const chips = standing
    ? [
        ...(await Promise.all(
          standing.parts.map(async (part, i) => {
            const { field, value } = await partSaid(programs, part, titled);
            const program = "call" in part ? programs.get(part.call.$ref) : undefined;
            return chip(
              field,
              value,
              letGo(toward({ ...standing, parts: standing.parts.filter((_, j) => j !== i) })),
              changeBy(program?.takes.length ? () => take(program, sets(program, part), i) : undefined),
            );
          }),
        )),
        ...(standing.by
          ? [chip("Group by", standing.by, letGo(toward({ parts: standing.parts })), changeBy(regroup), "by")]
          : []),
      ]
    : one
      ? [
          ...(await Promise.all(
            one.instance.map(async (type) =>
              place(await titled(type), toward({ parts: [call(is("type"), { $ref: type })], by: "auto" })),
            ),
          )),
          chip("", String(one.body.title ?? one.id), letGo(toward({ parts: [], by: "auto" }))),
        ]
      : [
          chip(
            "",
            ids.length === 1 ? "1 holon" : `${ids.length} holons`,
            letGo(toward({ parts: [], by: "auto" })),
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
      // A program kept, taking nothing, is opened in the search as what it
      // gives, so its parts can be seen and changed; any other favorite is
      // gone to.
      const gives = favorite?.body.gives as Expression | undefined;
      const takes = favorite?.body.takes as unknown[] | undefined;
      if (favorite)
        found.push({
          label: String(favorite.body.title ?? id),
          meta: "favorite",
          lead: gives && !takes?.length ? { expression: gives } : { location: [id] },
        });
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
        found.push({ label: `Look here with ${other.body.title}`, meta: "component", lead: here(other.id) });
    const declaredSettings = (drawn?.body.settings ?? {}) as Record<string, { says: string; shape: unknown }>;
    if (drawn && drawn.id !== searching)
      for (const [key, setting] of Object.entries(declaredSettings))
        if (setting.shape === "boolean" && !(settings.said ?? []).includes(key)) {
          const now = given.offered[key] === true;
          found.push({
            label: `${capital(key)}: ${now ? "on" : "off"}`,
            meta: `turn ${now ? "off" : "on"}: ${setting.says}`,
            lead: { offer: { [key]: !now } },
          });
        }
    if (given.gathers)
      found.push({
        label: "Keep on the favorites",
        meta: "as a program of one's own",
        lead: { keep: given.gathers, title: await titleOf(programs, given.gathers, titled) },
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

  // What the words find, with nothing taken: the bricks they name, those
  // they begin first; the values in view they name; what near they name;
  // and, always, the words themselves as Text.
  const search = async (text: string): Promise<Found[]> => {
    const said = text.trim();
    const values = async (axis: "type" | "parent", program: Called) =>
      (await facet(axis, said, [{ program, given: [] }]))
        .filter(({ lead }) => lead)
        .slice(0, 3)
        .map((row) => ({ ...row, label: `${program.title}: ${row.label}` }));
    const types = await values("type", is("type"));
    const parents = await values("parent", is("children"));
    return [
      ...bricks()
        .filter(({ label }) => fits(said, label))
        .sort((a, b) => Number(begins(said, b.label)) - Number(begins(said, a.label))),
      ...types,
      ...parents,
      ...(await near()).filter(({ label }) => fits(said, label)),
      {
        label: `${is("text").title}: ${said}`,
        meta: "contains each word",
        lead: adding(call(is("text"), said)),
      },
    ];
  };

  const input = (
    <input class="search-input" type="search" role="combobox" aria-autocomplete="list" spellcheck="false" />
  ) as HTMLInputElement;
  const pending = (<span class="part pending" />) as HTMLElement;
  // How much is in view, said beneath where one stands: how many holons a way
  // of looking gathers, and, grouped, in how many collections.
  const grouped = given.gathers ? await space.read({ groups: given.gathers }) : null;
  const counted = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;
  const status = !given.gathers
    ? ""
    : grouped?.groups.length
      ? [
          `${counted(given.list?.length ?? 0, "holon")}: ${counted(grouped.groups.length, "collection")}`,
          ...(grouped.rest.length ? [`${grouped.rest.length} more`] : []),
        ].join(", ")
      : counted(given.list?.length ?? 0, "holon");
  const listed = (<ul class="search-found" role="listbox" />) as HTMLElement;
  const element = (
    <div class={settings.pressed ? "search pressed" : "search"}>
      <div class="search-field">
        {settings.pressed && standing && <span class="part-field">From here</span>}
        {chips}
        {pending}
        {input}
      </div>
      {status && <p class="search-status">{status}</p>}
      {listed}
    </div>
  ) as HTMLElement;

  // What is being built, said before what is typed, and what it asks for.
  const asks: Record<string, string> = {
    holon: "type the title of the holon",
    words: "type the words",
    store: "choose a store",
    axis: "choose what to group by",
  };
  const said = () => {
    pending.textContent = frames.map(({ program }) => program.title).join(" ▸ ");
    pending.hidden = !pending.textContent;
    const frame = frames.at(-1);
    const kind = needs();
    input.placeholder = !frame
      ? settings.pressed && standing
        ? "Look from here: Type, Children of, Text, Not…"
        : "Add a part: Type, Children of, Text, Not, Group by… or Open a holon"
      : kind === "set"
        ? frame.program.native === "type"
          ? "choose a type, or build it of a brick"
          : frame.program.native === "children"
            ? "choose a parent, or build it of a brick"
            : "type a title, or build it of a brick"
        : (asks[kind!] ?? "");
  };

  // What was found, each a row, pressed to go where it leads or to take a
  // step. The first is where Enter goes.
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
          {row.lead ? (
            press(
              row.lead,
              <span class="found-label">{row.label}</span>,
              <span class="meta">{row.meta}</span>,
            )
          ) : row.step ? (
            <button
              type="button"
              class="lead"
              onClick={() => ((input.value = ""), row.step!(), said(), input.focus())}
            >
              <span class="found-label">{row.label}</span>
              <span class="meta">{row.meta}</span>
            </button>
          ) : (
            <span class="found-said">{row.label}</span>
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
    const found = frames.length
      ? await choices(text)
      : text.trim()
        ? await search(text)
        : [...(await near()), ...bricks()];
    if (turn === asked) show(found);
  };
  const again = () => void (asking = ask().catch((error: unknown) => console.error(error)));

  // A program taken, to be given what it takes, maybe given some already,
  // in the place of the part it changes, if it changes one.
  function take(program: Called, given: Argument[] = [], change?: number) {
    input.value = "";
    if (change !== undefined) {
      frames = [];
      changing = change;
    }
    frames = [...frames, { program, given }];
    said();
    again();
    input.focus();
  }
  // Grouping what is in view anew, whatever was being built let go.
  function regroup() {
    frames = [];
    changing = undefined;
    take(is("group"), [base()]);
  }
  // Letting go of the program taken last, and of the change with the last.
  const back = () => {
    frames = frames.slice(0, -1);
    if (!frames.length) changing = undefined;
    said();
    again();
  };

  // A press that leads somewhere ends what was being built, whether or not
  // the place it leads to is new.
  element.addEventListener("click", (event) => {
    const at = (event.target as Element).closest(
      "[data-expression], [data-location], [data-offer], [data-keep]",
    );
    if (!at || !element.contains(at)) return;
    frames = [];
    changing = undefined;
    input.value = "";
    said();
    again();
  });
  // A press on what was found keeps the focus where one types, so what was
  // found stays shown while it is pressed, and typing goes on.
  listed.addEventListener("mousedown", (event) => event.preventDefault());
  input.addEventListener("input", again);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") return (event.preventDefault(), mark(active + 1));
    if (event.key === "ArrowUp") return (event.preventDefault(), mark(active - 1));
    // Enter goes where the first row leads, once what was typed is found.
    if (event.key === "Enter") {
      event.preventDefault();
      return void asking.then(() => rows()[active]?.querySelector<HTMLElement>(".lead")?.click());
    }
    // Backspace lets go of what was taken, as a word is let go, else of the
    // last part; the grouping is let go of by its own chip.
    if (event.key === "Backspace" && input.value === "") {
      if (frames.length) return (event.preventDefault(), back());
      [...element.querySelectorAll<HTMLElement>(".part:not(.by) > .let-go")].at(-1)?.click();
    }
    // Escape lets go of what was typed, then of what was taken, then of the
    // search itself; in a menu, it closes the menu.
    if (event.key === "Escape") {
      event.preventDefault();
      if (input.value) return ((input.value = ""), again());
      if (frames.length) return back();
      input.blur();
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

// A part of where one stands: its field and value, pressed to change it
// where it can be, and let go with its × where it can be.
function chip(field: string, value: string, without?: Lead, change?: () => void, kind = "") {
  const label = [field, value].filter(Boolean).join(": ");
  return (
    <span class={kind ? `part ${kind}` : "part"}>
      <button type="button" class="part-change" disabled={!change} onClick={change}>
        {field && <span class="part-field">{value ? `${field}:` : field}</span>}
        {value && <span class="part-value">{value}</span>}
      </button>
      {without && (
        <button type="button" class="let-go" aria-label={`Let go of ${label}`} {...attributes(without)}>
          ×
        </button>
      )}
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
