// The fallback for any value. A holon is drawn as a record, read live: its name, a quiet
// line of its types and store, what it says, its short fields as keys beside their
// values, then each long field, a list of holons or long content, as a section of its
// own under its key; a type adds the fields it takes. Any other value is drawn as what it
// is: words, a number, a list item by item, a record field by field, a drawing within it
// as the component it names.
//
// Holons in a list are shown as cards, as rows, or as a table where they keep the same
// fields, the reader choosing, remembered for the place in this browser; few are cards
// at first, many rows. Each says what it is by the rules of summary.ts. A few of them
// within a record are said inline.
//
// A holon referred to anywhere is a link, ?q=@id, so moving between holons is following
// links, and the browser keeps the way back. Each link and card says the name of the
// holon it leads to, or what it is where it has none: what is drawn is put in place only
// once those are read, so no id shows on the way. An id is the inspector's to show.

import { h, type Child } from "./jsx.ts";
import type { Answer } from "../../engine/engine.ts";
import { isRecord, isRef, ref, type Value } from "../../engine/read/values.ts";
import { applying, applyingEach } from "./carried.ts";
import { arrange, isDrawing, note, type Realization, type Space } from "./chassis.ts";
import { inline as inlineProse, type Holons } from "./prose.tsx";
import { ledeOf, modeFor, saidOf, sharedKeys, summaryOf, titleOf, type Mode, type Said } from "./summary.ts";

// So many items of a list or a record are drawn, and the rest counted.
const most = 200;
// So many holons a list may hold and still be said inline, within a record.
const inline = 4;
// So long a text may be and still stand beside its key.
const short = 140;
// So long what is drawn waits for the names within it before it is shown anyway.
const patience = 300;

export const value: Realization = (given, space) => {
  const node = (<div class="value" />) as HTMLElement;
  let holon: string | undefined;
  let stop: (() => void) | undefined;
  let turn = 0;

  const unsubscribe = () => {
    turn++;
    stop?.();
    stop = undefined;
    holon = undefined;
  };

  // What is drawn, put in place once what it refers to is named.
  const showing = (mine: number, drawn: () => Node) =>
    space.redraw(() => {
      const made = drawn();
      const naming = named(made, space);
      if (!naming) return arrange(node, [made]);
      void naming.then(() => mine === turn && arrange(node, [made]));
    });

  function update([shown = null]: Value[]) {
    if (isRef(shown)) {
      if (holon === shown.$ref) return;
      unsubscribe();
      holon = shown.$ref;

      const mine = turn;
      let was: string | undefined;
      void space
        .subscribe(applying(space.glass, "holon", ref(holon)), (answer) => {
          // A store changing answers every read again; one answered as it was is kept.
          const said = JSON.stringify("value" in answer ? answer.value : answer.problem);
          if (mine !== turn || said === was) return;
          was = said;
          showing(mine, () => holonDrawn(answer, space));
        })
        .then((stopping) => (mine === turn ? (stop = stopping) : stopping()));
      return;
    }

    unsubscribe();
    showing(turn, () => topDrawn(shown, space));
  }

  update(given);
  return { node, update, dispose: unsubscribe };
};

// A value given to be drawn on its own: a list of holons as such, nothing said as such.
function topDrawn(shown: Value, space: Space): Node {
  if (shown === null) return note("Nothing.");
  if (Array.isArray(shown) && shown.length === 0) return note("An empty list.");
  if (Array.isArray(shown) && shown.every(isRef))
    return holonsOf(
      shown.map(({ $ref }) => $ref),
      { place: `asked ${new URLSearchParams(location.search).get("q") ?? ""}` },
    );
  return <div class="shown">{drawer(space)(shown)}</div>;
}

// Whether a value is said beside its key: nothing, a number, a short line of words, a
// holon, a few holons, a short list of words or numbers, or an empty record.
function isShort(value: Value): boolean {
  if (typeof value === "string") return value.length <= short && !value.includes("\n");
  if (value === null || typeof value !== "object") return true;
  if (isRef(value)) return true;
  if (Array.isArray(value))
    return value.length === 0 || (value.every(isRef) ? value.length <= inline : saidInline(value));
  return !isDrawing(value) && Object.keys(value).length === 0;
}

// A list of words or numbers short enough to be said on one line.
const saidInline = (list: Value[]) =>
  list.every((item) => typeof item === "number" || typeof item === "string") &&
  list.length <= 8 &&
  list.join(", ").length < 80;

const holonList = (value: Value): value is { $ref: string }[] =>
  Array.isArray(value) && value.length > inline && value.every(isRef);

// A holon as the native holon reads it: its name, its types and store, what it says,
// its short fields, then its long ones, and the fields it takes where it is a type.
function holonDrawn(answer: Answer, space: Space): Node {
  if (!("value" in answer)) return note(answer.problem);
  if (!isRecord(answer.value)) return note("No store mounted here keeps this holon.");

  const { id, name, store, instance, body, mould } = answer.value as Record<string, Value>;
  const types = Array.isArray(instance) ? instance.map(String) : [];
  const own = isRecord(body) ? (body as Record<string, Value>) : {};
  const says = typeof own.says === "string" ? own.says : undefined;
  const fields = Object.entries(own).filter(([key]) => !(key === "says" && says !== undefined));
  const takes = Object.entries(isRecord(mould) ? mould : {});
  const valueOf = drawer(space, String(id));
  // What it says, or else the words of the paragraph its flow opens with.
  const lede = ledeOf(saidOf(answer.value));

  return (
    <article class="holon" data-holon={String(id)}>
      <header>
        <h1>{titleOf(saidOf(answer.value), String(id))}</h1>
        <p class="kind">
          {mould ? <span>type</span> : null}
          {types.map((type) => link(type))}
          {store && store !== name ? <span>{`in ${store}`}</span> : null}
        </p>
        {says ? <p class="lede">{says}</p> : lede && <p class="lede" data-lede={lede} hidden />}
      </header>
      {fieldsOf(fields, valueOf, String(id))}
      {!fields.length && !takes.length && <p class="note">It keeps nothing beyond its name.</p>}
      {takes.length > 0 && (
        <section class="field takes">
          <h2 class="key">{`What each ${typeof name === "string" ? name : "one"} keeps`}</h2>
          <dl class="fields">
            {takes.map(([key, field]) => (
              <div>
                <dt>{key}</dt>
                <dd>{fieldSaid(field as Value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <p class="asks">
        <a href={`?q=${encodeURIComponent(`@${id} | in | map(e => e.from)`)}`}>What refers to it</a>
      </p>
    </article>
  );
}

// A record's fields: the short ones each beside its key, then each long one a section of
// its own under its key; a list of holons remembered by the place given and its key.
function fieldsOf(fields: [string, Value][], drawnOf: (value: Value, key?: string) => Child, place?: string) {
  const besides = fields.filter(([, inner]) => isShort(inner));
  const sections = fields.filter(([, inner]) => !isShort(inner));
  return [
    besides.length > 0 && (
      <dl class="fields">
        {besides.map(([key, inner]) => (
          <div>
            <dt>{key}</dt>
            <dd>{drawnOf(inner, key)}</dd>
          </div>
        ))}
      </dl>
    ),
    ...sections.map(([key, inner]) => (
      <section class="field">
        {holonList(inner)
          ? holonsOf(
              inner.map(({ $ref }) => $ref),
              { title: key, ...(place && { place: `${place}/${key}` }) },
            )
          : [<h2 class="key">{key}</h2>, drawnOf(inner, key)]}
      </section>
    )),
  ];
}

// A field a type takes: what it says, and its shape, quietly.
function fieldSaid(field: Value): Child {
  if (!isRecord(field)) return <span class="meta">{JSON.stringify(field)}</span>;
  const { says, shape, optional } = field as Record<string, Value>;
  return [
    typeof says === "string" ? <span class="words">{says}</span> : null,
    <span class="shape">
      {[shapeSaid(shape ?? null), optional ? "optional" : null].filter(Boolean).join(" · ")}
    </span>,
  ];
}

// A shape said in words: a set or a list of a shape, a record of shapes, or its name.
function shapeSaid(shape: Value): string {
  if (typeof shape === "string") return shape;
  if (isRecord(shape) && !isRef(shape)) {
    const each = Object.entries(shape as Record<string, Value>);
    if (each.length === 1 && ["set", "list"].includes(each[0]![0]))
      return `${each[0]![0]} of ${shapeSaid(each[0]![1])}`;
    return `{ ${each.map(([key, inner]) => `${key}: ${shapeSaid(inner)}`).join(", ")} }`;
  }
  return JSON.stringify(shape);
}

// A value as what it is, each drawing in it drawn by the space, at the next index. A
// list of holons within it is remembered by the place given, and the key it stands at;
// a value given on its own, by what is asked.
function drawer(space?: Space, place = `asked ${new URLSearchParams(location.search).get("q") ?? ""}`) {
  let drawn = 0;

  return function drawnOf(value: Value, key?: string): Child {
    if (value === null || value === undefined) return <span class="meta">nothing</span>;
    if (typeof value === "string")
      return value.includes("\n") ? <pre class="text">{value}</pre> : <span class="words">{value}</span>;
    if (typeof value === "number" || typeof value === "boolean")
      return <span class="number">{String(value)}</span>;
    if (isRef(value)) return link(value.$ref, (value as { $holds?: boolean }).$holds === true);
    if (isDrawing(value) && space) return space.draw(value, drawn++);

    if (Array.isArray(value)) {
      if (value.length === 0) return <span class="meta">none</span>;
      if (value.every(isRef)) {
        const ids = value.map(({ $ref }) => $ref);
        if (ids.length <= inline) return <span class="inline">{ids.map((id) => link(id))}</span>;
        return holonsOf(ids, { place: `${place}/${key ?? ""}` });
      }
      if (saidInline(value)) return <span class="inline">{value.map((item) => drawnOf(item))}</span>;
      return (
        <ol class="items">
          {value.slice(0, most).map((item) => (
            <li>{drawnOf(item)}</li>
          ))}
          {value.length > most && <li class="meta">{`${value.length - most} more`}</li>}
        </ol>
      );
    }

    const fields = Object.entries(value);
    if (!fields.length) return <span class="meta">nothing</span>;
    return (
      <div class="record">
        {fieldsOf(fields.slice(0, most), drawnOf, place)}
        {fields.length > most && <p class="meta">{`${fields.length - most} more`}</p>}
      </div>
    );
  };
}

// A link to a holon, named once it is read; one held, where it is a use, said as the
// language says it.
const link = (id: string, held = false) => (
  <a class="ref" href={`?q=@${id}`} data-ref={id} data-held={held}>
    {"…"}
  </a>
);

// A list of holons: shown as cards, rows or a table, by the reader's choice, kept for the
// place given in this browser; filled once the holons are read (named, below).
type Shown = { fill(read: ReadonlyMap<string, Read>, space: Space): void };
const shownLists = new WeakMap<Element, Shown>();

const modes: Mode[] = ["cards", "rows", "table"];

// A holon as a card, a link wholly, said once it is read (named, below).
export const cardOf = (id: string, name = "…") => (
  <a class="card" href={`?q=@${id}`} data-ref={id} data-row="">
    <span class="card-name">{name}</span>
    <span class="card-says" />
    <span class="card-kind" />
  </a>
);

function holonsOf(ids: string[], { title, place }: { title?: string; place?: string }): HTMLElement {
  const items = (
    <ul class="rows">
      {ids.slice(0, most).map((id) => (
        <li>{cardOf(id)}</li>
      ))}
      {ids.length > most && <li class="meta more">{`${(ids.length - most).toLocaleString("en")} more`}</li>}
    </ul>
  ) as HTMLElement;
  const buttons = modes.map(
    (mode) =>
      (
        <button type="button" data-mode={mode} onClick={() => choose(mode)}>
          {mode}
        </button>
      ) as HTMLButtonElement,
  );
  const node = (
    <section class="holons">
      <header>
        {title && <h2 class="key">{title}</h2>}
        <span class="count">{`${ids.length.toLocaleString("en")}${title ? "" : ids.length === 1 ? " holon" : " holons"}`}</span>
        <span class="modes" role="group" aria-label="Show as">
          {buttons}
        </span>
      </header>
      {items}
    </section>
  ) as HTMLElement;

  let read: ReadonlyMap<string, Read> = new Map();
  let space: Space | undefined;
  let table: HTMLElement | undefined;
  let mode = recalled(place) ?? modeFor(ids.length);

  // The keys most keep, but one each keeps only as its title.
  const tableKeys = () => {
    const shown = ids.slice(0, most).map((id) => read.get(id));
    return sharedKeys(shown.map((each) => each?.said)).filter(
      (key) =>
        !shown.every(
          (each) => each?.said?.body[key] === undefined || each.said.body[key] === each.summary.title,
        ),
    );
  };

  function show() {
    const keys = tableKeys();
    const now = mode === "table" && !keys.length ? modeFor(ids.length) : mode;
    buttons[2]!.hidden = !keys.length;
    for (const button of buttons) button.setAttribute("aria-pressed", String(button.dataset.mode === now));
    items.dataset.mode = now;
    if (now !== "table") return void (table?.remove(), (items.hidden = false));

    if (!table && space) {
      table = tableOf(ids.slice(0, most), keys, read);
      void named(table, space);
    }
    items.hidden = true;
    if (table && !table.isConnected) items.after(table);
  }

  function choose(chosen: Mode) {
    mode = chosen;
    remember(place, chosen);
    show();
  }

  shownLists.set(node, {
    fill(given, within) {
      read = given;
      space = within;
      table?.remove();
      table = undefined;
      show();
    },
  });
  show();
  return node;
}

// The holons as a table: each a row, its title a link, then what it keeps under each key.
function tableOf(ids: string[], keys: string[], read: ReadonlyMap<string, Read>): HTMLElement {
  const cell = (value: Value | undefined): Child => {
    if (value === undefined || value === null) return null;
    if (typeof value === "string") return value.length > short ? `${value.slice(0, short)}…` : value;
    if (typeof value === "number" || typeof value === "boolean")
      return <span class="number">{String(value)}</span>;
    if (isRef(value)) return link(value.$ref);
    if (Array.isArray(value)) {
      if (value.length && value.length <= inline && value.every(isRef))
        return <span class="inline">{value.map(({ $ref }) => link($ref))}</span>;
      if (saidInline(value)) return value.join(", ");
      return <span class="meta">{`${value.length.toLocaleString("en")} items`}</span>;
    }
    return <span class="meta">{`${Object.keys(value).length} fields`}</span>;
  };

  return (
    <div class="table">
      <table>
        <thead>
          <tr>
            <th scope="col">name</th>
            {keys.map((key) => (
              <th scope="col">{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const each = read.get(id);
            return (
              <tr>
                <th scope="row">
                  <a href={`?q=@${id}`} data-ref={id}>
                    {each?.summary.title ?? `@${id}`}
                  </a>
                </th>
                {keys.map((key) => (
                  <td>{cell(each?.said?.body[key])}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) as HTMLElement;
}

// The way a list at a place was last shown, in this browser; kept only as a convenience,
// so a browser keeping nothing loses nothing else.
const key = (place: string) => `glass:shown:${place}`;

function recalled(place?: string): Mode | undefined {
  if (!place) return undefined;
  try {
    const mode = localStorage.getItem(key(place));
    return modes.includes(mode as Mode) ? (mode as Mode) : undefined;
  } catch {
    return undefined;
  }
}

function remember(place: string | undefined, mode: Mode) {
  if (!place) return;
  try {
    localStorage.setItem(key(place), mode);
  } catch {}
}

// A holon as a link, a card or a row says it: as read, and as summed up.
type Read = { said?: Said; summary: ReturnType<typeof summaryOf> };

// The links and cards within a node, or those the selector picks, each given what it
// says of the holon it leads to, a brief by its first paragraph; and each lede waiting
// within it, the words of its paragraph. Done once read, or once waiting has been long
// enough, whichever is first.
export function named(within: Node, space: Space, selector = "a[data-ref]"): Promise<void> | undefined {
  const links = [...(within as Element).querySelectorAll<HTMLAnchorElement>(selector)];
  const waiting = [...(within as Element).querySelectorAll<HTMLElement>("[data-lede]")];
  const ids = [...new Set(links.map((each) => each.dataset.ref!))];
  if (!ids.length && !waiting.length) return;

  const reading = space
    .read(
      applyingEach(
        space.glass,
        "holon",
        ids.map((id) => [ref(id)]),
      ),
    )
    .then(async (answer) => {
      const values = "value" in answer && Array.isArray(answer.value) ? answer.value : [];
      const said = new Map(ids.map((id, i) => [id, saidOf(values[i] ?? null)]));
      const firsts = new Map(
        links
          .filter((each) => each.hasAttribute("data-row"))
          .map((each) => [each.dataset.ref!, ledeOf(said.get(each.dataset.ref!))]),
      );
      const words = await wordsOf([...firsts.values(), ...waiting.map((each) => each.dataset.lede)], space);
      const read = new Map(
        ids.map((id) => {
          const lede = words.get(firsts.get(id) ?? "");
          return [id, { said: said.get(id), summary: summaryOf(said.get(id), id, lede) }];
        }),
      );

      for (const each of links) sayInto(each, read.get(each.dataset.ref!));
      for (const each of waiting) {
        each.textContent = words.get(each.dataset.lede!) ?? "";
        each.hidden = !each.textContent;
      }
      for (const list of [within as Element, ...(within as Element).querySelectorAll(".holons")])
        shownLists.get(list)?.fill(read, space);
      await printedUses(links, said, space);
    })
    .catch(() => {
      for (const each of links) sayInto(each, undefined);
    });
  return Promise.race([reading, new Promise<void>((done) => setTimeout(done, patience))]);
}

// The words of each paragraph, as prose says them, read in one question.
async function wordsOf(paragraphs: (string | undefined)[], space: Space) {
  const asked = [...new Set(paragraphs.filter((each): each is string => Boolean(each)))];
  const words = new Map<string, string>();
  if (!asked.length) return words;

  const answer = await space.read(
    applyingEach(
      space.glass,
      "whole",
      asked.map((paragraph) => [ref(paragraph)]),
    ),
  );
  const wholes = "value" in answer && Array.isArray(answer.value) ? answer.value : [];
  asked.forEach((paragraph, i) => {
    const holons = isRecord(wholes[i]) ? (wholes[i] as Record<string, Value>).holons : undefined;
    if (!isRecord(holons)) return;
    const said = (<p>{inlineProse(holons as unknown as Holons, paragraph)}</p>).textContent?.trim();
    if (said) words.set(paragraph, said);
  });
  return words;
}

// The uses among the links, said as the language says them.
async function printedUses(links: HTMLAnchorElement[], said: Map<string, Said | undefined>, space: Space) {
  const uses = links.filter(
    (each) => each.hasAttribute("data-held") && said.get(each.dataset.ref!)?.types.includes("use"),
  );
  if (!uses.length) return;
  const printed = await space.read(
    applyingEach(
      space.glass,
      "print",
      uses.map((each) => [{ gives: { $ref: each.dataset.ref!, $holds: true } } as unknown as Value]),
    ),
  );
  const texts = "value" in printed && Array.isArray(printed.value) ? printed.value : [];
  uses.forEach((each, i) => {
    if (typeof texts[i] !== "string") return;
    each.replaceChildren(<code>{texts[i]}</code>);
    each.classList.replace("unnamed", "expression");
  });
}

function sayInto(each: HTMLAnchorElement, read: Read | undefined) {
  const id = each.dataset.ref!;
  if (!each.hasAttribute("data-row")) {
    each.textContent = titleOf(read?.said, id);
    if (!read?.said?.name) each.classList.add("unnamed");
    return;
  }
  const { title, says, kind } = read?.summary ?? summaryOf(undefined, id);
  each.querySelector(".card-name")!.textContent = title;
  each.querySelector(".card-says")!.textContent = says ?? "";
  each.querySelector(".card-kind")!.textContent = kind;
}
