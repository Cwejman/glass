import { namesAsked } from "../../language/names.ts";
import { parse } from "../../language/text.ts";
import { type Given, type HolonOf, type Reading, type Space } from "../../interface/component.ts";
import { candidates } from "../../interface/finding.ts";
import type { Argument, Axis, Expression } from "../../engine/expression.ts";
import type { HolonRead } from "../../engine/reads.ts";
import { canonical } from "../../store/canonical.ts";
import { begins, changedPart, fits, hasEnough, needs, same, settled, type Frame } from "./building.ts";
import { h } from "./jsx.ts";
import {
  call,
  holonsOf,
  native,
  partSaid,
  partsOf,
  functionsIn,
  heldBy,
  titleOf,
  together,
  type Called,
  type Parts,
} from "./parts.ts";

// A search: where one stands, said by what it means, and the functions to
// build where to look next. Given an expression, it says its parts, each a
// function and what it is given, as Type: Brief, pressed to change it or let
// go; given a holon, what it is and what it is called.
//
// Every function the field holds is a brick, glass's own and one's own
// alike, offered by its name. Typing finds the brick, Enter takes it, and
// what it takes is chosen in turn: a set among what is in view, the types
// and parents of what one is looking at, each with how many it holds, or
// among the holons whose name says what is typed, or built of another brick
// taken within it, so Not: Children of: Type: Brief is built as it reads;
// words as they are typed; an axis to group by. Once all it takes is given,
// it stands as one more part beside the others; a part given holons is given
// another by pressing it and choosing a second, as Type: Brief or Component,
// and Or builds an either of any parts. Open goes to one holon. Typed with
// no brick taken, the words find the values in view as well, as Type: Brief.
//
// Before anything is typed it offers what is near: what can be done here,
// given the component a place is drawn by, as look with another component,
// set what that component takes and nothing gave it, keep the way of
// looking as a function of one's own on the favorites; then the favorites;
// then the bricks.
//
// It acts on nothing. Each thing it offers that leads somewhere is a press
// that says where, as every location does, and rises to the mount that
// holds it.

export const declared = {
  name: "Search",
  says: "Where one stands, said by what it means, and the field's functions as bricks to build where to look next, each built expression a press that rises to the mount.",
  takes: [],
  kinds: ["full"],
  argument: "selection",
  settings: {
    drawn: {
      says: "The components the place is drawn by where it was pressed, its own first, then what holds it, whose settings it offers to set.",
      shape: { list: "ref" },
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
  reads: ["gather", "holon", "instances", "groups", "level", "named", "holders"],
};

type Ref = { $ref: string };

type SearchSettings = { drawn?: Ref[]; said?: string[]; pressed?: boolean };

// A component as the search reads it, to offer it or the settings it takes.
type ComponentBody = {
  takes: string[];
  kinds: string[];
  argument?: string;
  settings?: Record<string, { says: string; shape: unknown }>;
};

// What a press leads to: a place, by its holons, drawn as the mount finds
// or by a component; an expression; what the mount offers; or an
// expression to keep on the favorites.
type Lead =
  | { location: string[]; component?: string }
  | { expression: Expression; component?: string }
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

// Open is taken as a function, given a holon to go to.
const opening: Called = { id: "", title: "Open", takes: ["holon"] };

const shown = 8;

export default async function draw(given: Given<never, SearchSettings>, space: Space) {
  const settings = given.settings;
  const one = given.holon;
  const ids = given.list ?? (one ? [one.id] : []);
  const functions = await functionsIn(space, given.offered);
  const is = (name: string) => native(functions, name);
  const standing: Parts | undefined = given.gathers ? partsOf(functions, given.gathers) : undefined;

  const titled = async (id: string) => {
    const holon = await space.holon(id);
    return holon ? nameOf(holon) : "what is no longer in the field";
  };

  // What is being built: the functions taken and what each is given so far,
  // and which part it changes, if it changes one.
  let frames: Frame[] = [];
  let changing: number | undefined;

  // Nothing left to stand on is the root.
  const toward = (parts: Parts): Lead =>
    parts.parts.length || parts.by || parts.flat
      ? { expression: together(functions, parts) }
      : { location: [] };
  // Whether a value is one the part being changed is given already.
  const holds = (value: Argument) => {
    const was = changing !== undefined ? standing?.parts[changing] : undefined;
    const given =
      was && "call" in was && was.with?.length === 1 ? holonsOf(functions, was.with[0]) : undefined;
    return !!given?.some((each) => same(each, value));
  };

  // Where one stands with one more part: beside the others; joined, as
  // either it or the last; or in the place of the one being changed. From a
  // holon, from everything. A grouping changes the axis instead.
  const adding = (part: Expression): Lead => {
    if ("call" in part && part.call.$ref === is("group").id)
      return toward({ parts: standing?.parts ?? [], by: part.with![1] as Axis });
    if (!standing) return toward({ parts: [part] });

    const parts =
      changing !== undefined
        ? standing.parts.flatMap((each, i) => (i === changing ? changedPart(functions, each, part) : [each]))
        : [...standing.parts, part];
    return toward({ ...standing, parts });
  };

  // What the part being chosen narrows: where one stands, but the part it
  // takes the place of; from a holon, everything.
  const base = (): Expression => {
    if (!standing) return call(is("everything"));
    return together(functions, { parts: standing.parts.filter((_, i) => i !== changing) });
  };

  // A value offered to what is being built, or nothing, which closes the
  // function built last: a press that leads where the part made leads, or,
  // where more is to be given, a step.
  const offered = (value: Argument | undefined, label: string, meta: string, within = frames): Found => {
    const { frames: next, part } = settled(value, within);
    if (part) return { label, meta, lead: adding(part) };

    const step = () => {
      frames = next;
      again();
    };
    return { label, meta, step };
  };

  // The values in view along an axis, each with how many hold it, the
  // larger first, read once for what they narrow; then those whose name
  // says what is typed, each a value offered, the one the part being
  // changed holds marked.
  const facets = new Map<string, Promise<{ value: string; label: string; count: number }[]>>();
  const valuesIn = (axis: "type" | "parent" | "store") => {
    const key = `${axis} ${canonical(base())}`;
    if (!facets.has(key))
      facets.set(
        key,
        space.read({ groups: together(functions, { parts: [base()], by: axis }) }).then((grouped) =>
          Promise.all(
            (grouped?.groups ?? []).map(async ({ value, count }) => ({
              value,
              count,
              label: axis === "store" ? value : await titled(value),
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

  // The holons whose name says the words, those it begins first; and, where those are
  // few, those whose words say them.
  const holonsSaying = async (text: string) => {
    const words = text.trim();
    if (!words) return [];

    const naming = await space.read({ gather: call(is("named"), words) });
    const saying = naming.length >= shown ? [] : await space.read({ gather: call(is("search"), words) });
    const ids = [...new Set([...naming, ...saying])].slice(0, 60);
    const read = (await Promise.all(ids.map((id) => space.holon(id)))).filter((holon) => holon !== null);

    const rank = ({ name = "" }: { name?: string }) => (begins(words, name) ? 0 : fits(words, name) ? 1 : 2);

    return read.sort((a, b) => rank(a) - rank(b)).slice(0, shown);
  };

  // The bricks: every function the field holds, glass's own first, as the
  // field orders them. At the top, the parts stand side by side, which is
  // And, and no part at all is Everything; Or is built as any brick is, of
  // the sets it is given; Group by groups what is in view, and Open goes to
  // a holon. Within a brick, And and Everything are functions like any
  // other.
  const unoffered = new Set(["everything", "and"]);
  const gathers = (fn: Called) =>
    fn.takes.every((kind) => ["set", "sets", "words", "store", "axis"].includes(kind));
  const brick = (fn: Called): Found => {
    if (fn.takes.length === 0) return offered(call(fn), fn.title, "a set of its own");
    return { label: fn.title, meta: `takes ${fn.takes.join(", ")}`, step: () => take(fn) };
  };

  const bricks = (): Found[] => {
    const within = frames.length > 0;
    const own = [...functions.values()].filter(
      (fn) =>
        gathers(fn) &&
        (!fn.native ||
          (fn.native !== "group" && fn.native !== "flat" && (within || !unoffered.has(fn.native)))),
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
            ...(standing && !standing.flat && !standing.by
              ? [
                  {
                    label: "Flat",
                    meta: "all of what is in view, not only its level",
                    lead: toward({ parts: standing.parts, flat: true }),
                  },
                ]
              : []),
            { label: "Open", meta: "go to one holon", step: () => take(opening) },
          ]
        : []),
    ];
  };

  // What can be chosen for what is being built, as what is typed narrows
  // it: by the kind of argument the function takes next.
  const choices = async (text: string): Promise<Found[]> => {
    const frame = frames.at(-1)!;
    const kind = needs(frames);

    if (kind === "holon")
      return (await holonsSaying(text)).map((holon) => ({
        label: nameOf(holon),
        meta: holon.types.join(", "),
        lead: { location: [holon.id] },
      }));

    if (kind === "words") return text.trim() ? [offered(text.trim(), text.trim(), "contains each word")] : [];

    if (kind === "store") return facet("store", text);

    if (kind === "axis")
      return (["type", "parent", "store"] as Axis[])
        .filter((axis) => fits(text, axis))
        .map((axis) => offered(axis, axis, `one collection for each ${axis}`));

    // A set: what is in view, for a type or a parent; else the holons whose
    // name says what is typed; and every brick, to build it of.
    const values =
      frame.fn.native === "type"
        ? await facet("type", text)
        : frame.fn.native === "children"
          ? await facet("parent", text)
          : (await holonsSaying(text)).map((holon) =>
              offered({ $ref: holon.id }, nameOf(holon), holon.types.join(", ")),
            );

    // The bricks the words name come first, so a brick is built rather
    // than its own holon chosen.
    const named = bricks()
      .filter(({ label }) => fits(text, label))
      .sort((a, b) => Number(begins(text, b.label)) - Number(begins(text, a.label)));

    // Done, where enough sets are given, first while nothing is typed, else
    // after what the words find.
    const done = hasEnough(frame) ? [offered(undefined, "Done", "with the sets given")] : [];

    return text.trim() ? [...named, ...values, ...done] : [...done, ...values, ...named];
  };

  // What a part changed starts from: a function of any number of sets, the
  // sets it is given; any other, nothing.
  const sets = (fn: Called, part: Expression): Argument[] =>
    fn.takes.at(-1) === "sets" && "call" in part ? [...(part.with ?? [])] : [];

  // Where one stands: each part a chip, its field and value, pressed to
  // change it or let go; a holon, by its types, each a way to its kind, and
  // its name, let go for everything; a list, by how many.
  //
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
            const { field, value } = await partSaid(functions, part, titled);
            const fn = "call" in part ? functions.get(part.call.$ref) : undefined;
            return chip(
              field,
              value,
              letGo(toward({ ...standing, parts: standing.parts.filter((_, j) => j !== i) })),
              changeBy(fn?.takes.length ? () => take(fn, sets(fn, part), i) : undefined),
            );
          }),
        )),
        ...(standing.by
          ? [chip("Group by", standing.by, letGo(toward({ parts: standing.parts })), changeBy(regroup), "by")]
          : []),
        ...(standing.flat
          ? [chip("Flat", "", letGo(toward({ parts: standing.parts })), undefined, "by")]
          : []),
      ]
    : one
      ? [
          ...(await Promise.all(
            one.instance.map(async (type) =>
              place(await titled(type), toward({ parts: [call(is("type"), { $ref: type })] })),
            ),
          )),
          chip("", nameOf(one), letGo(toward({ parts: [] }))),
        ]
      : [chip("", ids.length === 1 ? "1 holon" : `${ids.length} holons`, letGo(toward({ parts: [] })))];

  const favorites = ((given.offered.favorites ?? []) as Ref[]).map(({ $ref }) => $ref);

  // What is near, before anything is typed.
  const near = async (): Promise<Found[]> => {
    const found: Found[] = [];
    if (settings.pressed) found.push(...(await doable()));

    // A favorite no longer in the field is passed by.
    for (const id of favorites) {
      const favorite = await space.holon(id);

      // A function kept, taking nothing, is opened in the search as what it
      // gives, so its parts can be seen and changed; any other favorite is
      // gone to.
      const gives = favorite?.body.gives as Expression | undefined;
      const takes = favorite?.body.takes as unknown[] | undefined;
      if (favorite)
        found.push({
          label: nameOf(favorite),
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
    const [drawn, ...holders] = await Promise.all(
      (settings.drawn ?? []).map(({ $ref }) => space.holon<ComponentBody>($ref)),
    );
    const searching = (given.offered.search as Ref | undefined)?.$ref;
    const here = (component?: string): Lead =>
      given.gathers ? { expression: given.gathers, component } : { location: ids, component };

    found.push({ label: "Look here", meta: "go", lead: here() });

    for (const other of await drawers())
      if (other.id !== drawn?.id && other.id !== searching)
        found.push({ label: `Look here with ${nameOf(other)}`, meta: "component", lead: here(other.id) });

    // Each component's settings that are true or false, but those its slot
    // gave, said with whose they are.
    const offering = new Set<string>();
    for (const [i, component] of [drawn, ...holders].entries()) {
      if (!component || component.id === searching) continue;

      for (const [key, setting] of Object.entries(component.body.settings ?? {}))
        if (
          setting.shape === "boolean" &&
          !(i === 0 && (settings.said ?? []).includes(key)) &&
          !offering.has(key)
        ) {
          offering.add(key);
          const now = given.offered[key] === true;
          found.push({
            label: `${capital(key)}: ${now ? "on" : "off"}`,
            meta: `${nameOf(component)}, turn ${now ? "off" : "on"}: ${setting.says}`,
            lead: { offer: { [key]: !now } },
          });
        }
    }

    if (given.gathers)
      found.push({
        label: "Keep on the favorites",
        meta: "as a function of one's own",
        lead: { keep: given.gathers, title: await titleOf(functions, given.gathers, titled) },
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

  // The components that can draw this place in full, glass's own and the
  // reader's.
  const drawers = async () => {
    const offeredHere = await heldBy(space, given.offered.components);
    const type = offeredHere[0]?.instance[0];
    if (!type) return [];

    const own = await Promise.all(
      (await space.read({ instances: type, store: "home" })).map((id) => space.holon(id)),
    );
    const all = [...offeredHere, ...own];

    const reads: Reading = given.gathers
      ? { gather: given.gathers }
      : one
        ? { holon: one.id }
        : { list: given.list ?? [] };

    return candidates(
      all.filter((component) => component !== null) as HolonRead[],
      reads,
      (one ?? null) as HolonRead | null,
      "full",
    ) as HolonOf<ComponentBody>[];
  };

  // Words that read as an expression in the language, as an agent types it at the
  // command line, are a way of looking of their own, or a holon to go to.
  const written = async (text: string): Promise<Found[]> => {
    if (!/[(@|]/.test(text)) return [];

    try {
      const expression = parse(text, await namesAsked(space.read, text)) as Expression;
      const lead: Lead = "$ref" in expression ? { location: [expression.$ref] } : { expression };

      return [{ label: text, meta: "said in the language", lead }];
    } catch {
      return [];
    }
  };

  // What the words find, with nothing taken: the holons they begin, the bricks they
  // name, the holons they name; the values in view they name; what near they name; and,
  // always, the words themselves as Text.
  const search = async (text: string): Promise<Found[]> => {
    const said = text.trim();
    const values = async (axis: "type" | "parent", fn: Called) =>
      (await facet(axis, said, [{ fn, given: [] }]))
        .filter(({ lead }) => lead)
        .slice(0, 3)
        .map((row) => ({ ...row, label: `${fn.title}: ${row.label}` }));

    const types = await values("type", is("type"));
    const parents = await values("parent", is("children"));

    // The holons whose name says the words, each a place to go: those it
    // begins first of all, so a holon is found by its name. A function is its
    // brick, so it is built rather than gone to; Open goes to it.
    const holons = (await holonsSaying(said))
      .filter(({ id, name = "" }) => !functions.has(id) && fits(said, name))
      .map((holon) => ({
        label: nameOf(holon),
        meta: holon.types.join(", "),
        lead: { location: [holon.id] } as Lead,
        first: begins(said, nameOf(holon)),
      }));

    // A brick the words begin comes first, so Enter takes what was typed for.
    const named = bricks().filter(({ label }) => fits(said, label));

    return [
      ...(await written(said)),
      ...named.filter(({ label }) => begins(said, label)),
      ...holons.filter(({ first }) => first).slice(0, 4),
      ...named.filter(({ label }) => !begins(said, label)),
      ...holons.filter(({ first }) => !first).slice(0, 3),
      ...types,
      ...parents,
      ...(await near()).filter(({ label }) => fits(said, label)),
      {
        label: `${is("search").title}: ${said}`,
        meta: "contains each word",
        lead: adding(call(is("search"), said)),
      },
    ];
  };

  const input = (
    <input class="search-input" type="search" role="combobox" aria-autocomplete="list" spellcheck="false" />
  ) as HTMLInputElement;
  const pending = (<span class="part pending" />) as HTMLElement;

  // How much is in view, said beneath where one stands: how many holons a way
  // of looking gathers, and how many of them stand at its level, or, grouped, in
  // how many collections.
  const grouped = given.gathers ? await space.read({ groups: given.gathers }) : null;
  const atLevel = given.gathers && !grouped ? await space.read({ level: given.gathers }) : [];
  const counted = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;
  const status = !given.gathers
    ? ""
    : grouped?.groups.length
      ? [
          `${counted(given.list?.length ?? 0, "holon")}: ${counted(grouped.groups.length, "collection")}`,
          ...(grouped.rest.length ? [`${grouped.rest.length} more`] : []),
        ].join(", ")
      : [
          counted(given.list?.length ?? 0, "holon"),
          ...(atLevel.length < (given.list?.length ?? 0) ? [`${atLevel.length} at this level`] : []),
        ].join(", ");

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

  // What is being built, said before what is typed, and, in a word, what
  // it asks for; nothing being built, nothing is asked.
  const asks: Record<string, string> = {
    holon: "a name",
    words: "words",
    store: "a store",
    axis: "an axis",
  };

  const sayWhatIsBuilt = () => {
    pending.textContent = frames.map(({ fn }) => fn.title).join(" ▸ ");
    pending.hidden = !pending.textContent;

    const frame = frames.at(-1);
    const kind = needs(frames);
    input.placeholder = !frame
      ? ""
      : kind === "set"
        ? frame.fn.native === "type"
          ? "a type"
          : frame.fn.native === "children"
            ? "a parent"
            : "a name"
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
              onClick={() => {
                input.value = "";
                row.step!();
                sayWhatIsBuilt();
                input.focus();
              }}
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

  const again = () => {
    asking = ask().catch((error: unknown) => console.error(error));
  };

  // A function taken, to be given what it takes, maybe given some already,
  // in the place of the part it changes, if it changes one.
  function take(fn: Called, given: Argument[] = [], change?: number) {
    input.value = "";

    if (change !== undefined) {
      frames = [];
      changing = change;
    }

    frames = [...frames, { fn, given }];
    sayWhatIsBuilt();
    again();
    input.focus();
  }

  // Grouping what is in view anew, whatever was being built let go.
  function regroup() {
    frames = [];
    changing = undefined;
    take(is("group"), [base()]);
  }

  // Letting go of the function taken last, and of the change with the last.
  const back = () => {
    frames = frames.slice(0, -1);
    if (!frames.length) changing = undefined;
    sayWhatIsBuilt();
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
    sayWhatIsBuilt();

    // After the press has risen: between one listener and the next a real press lets
    // promises run, and rows drawn anew would take what was pressed out of the page
    // before the mount could find it.
    setTimeout(again);
  });

  // A press on what was found keeps the focus where one types, so what was
  // found stays shown while it is pressed, and typing goes on.
  listed.addEventListener("mousedown", (event) => event.preventDefault());

  input.addEventListener("input", again);

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      mark(active + 1);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      mark(active - 1);
    }

    // Enter goes where the first row leads, once what was typed is found.
    if (event.key === "Enter") {
      event.preventDefault();
      void asking.then(() => rows()[active]?.querySelector<HTMLElement>(".lead")?.click());
    }

    // Backspace lets go of what was taken, as a word is let go, else of the
    // last part; the grouping is let go of by its own chip.
    if (event.key === "Backspace" && input.value === "") {
      if (frames.length) {
        event.preventDefault();
        back();
      } else {
        [...element.querySelectorAll<HTMLElement>(".part:not(.by) > .let-go")].at(-1)?.click();
      }
    }

    // Escape lets go of what was typed, then of what was taken, then of the
    // search itself; in a menu, it closes the menu.
    if (event.key === "Escape") {
      event.preventDefault();

      if (input.value) {
        input.value = "";
        again();
      } else if (frames.length) {
        back();
      } else {
        input.blur();
      }
    }
  });

  sayWhatIsBuilt();
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

// What a holon is called; one with no name, by its id.
const nameOf = (holon: { id: string; name?: string }) => holon.name ?? holon.id;

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
