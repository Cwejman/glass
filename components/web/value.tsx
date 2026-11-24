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
// holon it leads to, or what it is where it has none, each read live; the chassis shows
// what is drawn once all of it is read, so no id shows on the way. An id is the
// inspector's to show.

import { href, hrefTo } from "./link.ts";
import { h, type Child } from "./jsx.ts";
import { isRecord, isRef, ref, type Value } from "../../engine/read/values.ts";
import { q } from "../../language/shipped.ts";
import { isDrawing, type IO, type Realization } from "../../chassis/web/chassis.ts";
import { inline as inlineProse, type Holons } from "./prose.tsx";
import { ledeOf, modeFor, saidOf, sharedKeys, summaryOf, titleOf, type Mode, type Said } from "./summary.ts";

// So many items of a list or a record are drawn, and the rest counted.
const most = 200;
// So many holons a list may hold and still be said inline, within a record.
const inline = 4;
// So long a text may be and still stand beside its key.
const short = 140;

export const value: Realization = ([given = null], io) => {
  if (!isRef(given)) return <div class="value">{topDrawn(given, io)}</div>;
  const holon = io.read(q`holon(${given})`);
  return <div class="value">{holon === undefined ? null : holonDrawn(holon, io)}</div>;
};

// A value given to be drawn on its own: a list of holons as such, nothing said as such,
// and a number or a truth, as a count is, a figure to be read at a glance.
function topDrawn(shown: Value, io: IO): Node {
  if (shown === null) return noted("Nothing.");
  if (typeof shown === "number" || typeof shown === "boolean")
    return <p class="figure">{typeof shown === "number" ? shown.toLocaleString("en") : String(shown)}</p>;
  if (Array.isArray(shown) && shown.length === 0) return noted("An empty list.");
  if (Array.isArray(shown) && shown.every(isRef))
    return holonsOf(
      io,
      shown.map(({ $ref }) => $ref),
      { place: placeOf(shown) },
    );
  return <div class="shown">{drawer(io)(shown)}</div>;
}

const noted = (text: string) => <p class="note">{text}</p>;

// Whether a value is said beside its key: nothing, a number, a short line of words, a
// holon, a short list of words or numbers, or an empty record. A list of holons, however
// short, is a section of its own.
function isShort(value: Value): boolean {
  if (typeof value === "string") return value.length <= short && !value.includes("\n");
  if (value === null || typeof value !== "object") return true;
  if (isRef(value)) return true;
  if (Array.isArray(value)) return value.length === 0 || (!value.every(isRef) && saidInline(value));
  return !isDrawing(value) && Object.keys(value).length === 0;
}

// A list of words or numbers short enough to be said on one line.
const saidInline = (list: Value[]) =>
  list.every((item) => typeof item === "number" || typeof item === "string") &&
  list.length <= 8 &&
  list.join(", ").length < 80;

const holonList = (value: Value): value is { $ref: string }[] =>
  Array.isArray(value) && value.length > 0 && value.every(isRef);

// A holon as the native holon reads it: its name, its types and store, what it says,
// its short fields, then its long ones, and the fields it takes where it is a type.
function holonDrawn(holon: Value, io: IO): Node {
  if (!isRecord(holon)) return noted("No store mounted here keeps this holon.");

  const { id, name, store, instance, body, mould } = holon as Record<string, Value>;
  const types = Array.isArray(instance) ? instance.map(String) : [];
  const own = isRecord(body) ? (body as Record<string, Value>) : {};
  const says = typeof own.says === "string" ? own.says : undefined;
  const fields = Object.entries(own).filter(([key]) => !(key === "says" && says !== undefined));
  const takes = Object.entries(isRecord(mould) ? mould : {});
  const drawnOf = drawer(io, String(id));
  // What it says, or else the words of the paragraph its flow opens with.
  const lede = ledeOf(saidOf(holon));

  return (
    <article class="holon" data-holon={String(id)}>
      <header>
        <h1>{titleOf(saidOf(holon), String(id))}</h1>
        <p class="kind">
          {mould ? <span>type</span> : null}
          {types.map((type) => link(io, type))}
          {store && store !== name ? <span>{`in ${store}`}</span> : null}
        </p>
        {says ? <p class="lede">{says}</p> : lede && ledeDrawn(io, lede)}
      </header>
      {fieldsOf(fields, drawnOf, io, String(id))}
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
        <a href={href(`@${id} | in | map(e => e.from)`)}>What refers to it</a>
      </p>
    </article>
  );
}

// The words a paragraph says, as a lede, where it says some.
function ledeDrawn(io: IO, paragraph: string): Node | null {
  const words = wordsOf(io, paragraph);
  return words ? <p class="lede">{words}</p> : null;
}

// A record's fields: the short ones each beside its key, then each long one a section of
// its own under its key; a list of holons remembered by the place given and its key.
function fieldsOf(
  fields: [string, Value][],
  drawnOf: (value: Value, key?: string) => Child,
  io: IO,
  place?: string,
) {
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
              io,
              inner.map(({ $ref }) => $ref),
              { title: key, place: `${place ?? placeOf(inner)}/${key}` },
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

// The place a value given on its own is remembered by: what it is, so the same answer is
// shown as it was last shown, wherever it is asked.
// The text is hashed, FNV-1a, so a long list is a short key.
const placeOf = (value: Value) => {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return `given ${hash.toString(36)}`;
};

// A value as what it is, each drawing in it drawn by the chassis, at the next index. A
// list of holons within it is remembered by the place given, and the key it stands at;
// a value given on its own, by what it is.
function drawer(io: IO, place?: string) {
  let drawn = 0;

  return function drawnOf(value: Value, key?: string): Child {
    if (value === null || value === undefined) return <span class="meta">nothing</span>;
    if (typeof value === "string")
      return value.includes("\n") ? <pre class="text">{value}</pre> : <span class="words">{value}</span>;
    if (typeof value === "number" || typeof value === "boolean")
      return <span class="number">{String(value)}</span>;
    if (isRef(value)) return link(io, value.$ref, (value as { $holds?: boolean }).$holds === true);
    if (isDrawing(value)) return io.draw(value, drawn++);

    if (Array.isArray(value)) {
      if (value.length === 0) return <span class="meta">none</span>;
      if (value.every(isRef)) {
        const ids = value.map(({ $ref }) => $ref);
        if (ids.length <= inline) return <span class="inline">{ids.map((id) => link(io, id))}</span>;
        return holonsOf(io, ids, { place: `${place ?? placeOf(value)}/${key ?? ""}` });
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
        {fieldsOf(fields.slice(0, most), drawnOf, io, place)}
        {fields.length > most && <p class="meta">{`${fields.length - most} more`}</p>}
      </div>
    );
  };
}

// A holon read where it is shown, as a summary needs it: nothing while it is read, null
// where no store keeps it.
function holonRead(io: IO, id: string): Said | null | undefined {
  const holon = io.read(q`holon(${ref(id)})`);
  return holon === undefined ? undefined : (saidOf(holon) ?? null);
}

// The words of a paragraph, as prose says them, once read.
function wordsOf(io: IO, paragraph: string | undefined): string | undefined {
  if (!paragraph) return undefined;
  const whole = io.read(q`whole(${ref(paragraph)})`);
  const holons = isRecord(whole ?? null) ? (whole as Record<string, Value>).holons : undefined;
  if (!isRecord(holons ?? null)) return undefined;
  return (<p>{inlineProse(holons as unknown as Holons, paragraph)}</p>).textContent?.trim() || undefined;
}

// A holon as a card or a row says it: its summary, a brief by its first paragraph;
// nothing while it is read.
type Summed = { said?: Said; summary: ReturnType<typeof summaryOf> } | undefined;

function summed(io: IO, id: string): Summed {
  const said = holonRead(io, id);
  if (said === undefined) return undefined;
  const lede = wordsOf(io, ledeOf(said ?? undefined));
  return { said: said ?? undefined, summary: summaryOf(said ?? undefined, id, lede) };
}

// A link to a holon, named once it is read; one held, where it is a use, said as the
// language says it.
function link(io: IO, id: string, held = false): Node {
  const said = holonRead(io, id);
  const printed = held ? io.read(q`print(${{ gives: { $ref: id, $holds: true } }})`) : undefined;
  const expression = said?.types.includes("use") && typeof printed === "string" ? printed : undefined;
  return (
    <a
      class={expression ? "ref expression" : said && !said.name ? "ref unnamed" : "ref"}
      href={hrefTo(id)}
      data-ref={id}
      data-held={held}
    >
      {expression ? <code>{expression}</code> : said === undefined ? "…" : titleOf(said ?? undefined, id)}
    </a>
  );
}

const modes: Mode[] = ["cards", "rows", "table"];

// A holon as a card, a link wholly, said once it is read.
export function cardOf(io: IO, id: string, name?: string, read: Summed = summed(io, id)): Node {
  const summary = read?.summary ?? summaryOf(undefined, id);
  return (
    <a class="card" href={hrefTo(id)} data-ref={id} data-row="">
      <span class="card-name">{read ? summary.title : (name ?? "…")}</span>
      <span class="card-says">{summary.says ?? ""}</span>
      <span class="card-kind">{read ? summary.kind : ""}</span>
    </a>
  );
}

// A list of holons: shown as cards, rows or a table, by the reader's choice, kept for the
// place given in this browser. Choosing changes how it is shown on the page at once; the
// choice kept, it is drawn so again.
function holonsOf(io: IO, ids: string[], { title, place }: { title?: string; place?: string }): Node {
  const shownIds = ids.slice(0, most);
  const reads = new Map(shownIds.map((id) => [id, summed(io, id)]));

  // The keys most keep, but one each keeps only as its title.
  const shown = shownIds.map((id) => reads.get(id));
  const keys = sharedKeys(shown.map((each) => each?.said)).filter(
    (key) =>
      !shown.every(
        (each) => each?.said?.body[key] === undefined || each.said.body[key] === each.summary.title,
      ),
  );
  const chosen = recalled(place) ?? modeFor(ids.length);
  const mode = chosen === "table" && !keys.length ? modeFor(ids.length) : chosen;

  const choose = (each: Mode) => (event: Event) => {
    remember(place, each);
    const section = (event.currentTarget as Element).closest(".holons")!;
    showAs(section, each === "table" && !keys.length ? modeFor(ids.length) : each);
  };

  return (
    <section class="holons">
      <header>
        {title && <h2 class="key">{title}</h2>}
        <span class="count">{`${ids.length.toLocaleString("en")}${title ? "" : ids.length === 1 ? " holon" : " holons"}`}</span>
        <span class="modes" role="group" aria-label="Show as">
          {modes.map((each) => (
            <button
              type="button"
              data-mode={each}
              aria-pressed={String(mode === each)}
              hidden={each === "table" && !keys.length}
              onClick={choose(each)}
            >
              {each}
            </button>
          ))}
        </span>
      </header>
      <ul class="rows" data-mode={mode === "table" ? "rows" : mode} hidden={mode === "table"}>
        {shownIds.map((id) => (
          <li>{cardOf(io, id, undefined, reads.get(id))}</li>
        ))}
        {ids.length > most && <li class="meta more">{`${(ids.length - most).toLocaleString("en")} more`}</li>}
      </ul>
      {keys.length > 0 && tableOf(io, shownIds, keys, reads, mode !== "table")}
    </section>
  );
}

// A list of holons shown another way, on the page as it stands.
function showAs(section: Element, mode: Mode) {
  for (const button of section.querySelectorAll(".modes button"))
    button.setAttribute("aria-pressed", String(button.getAttribute("data-mode") === mode));
  const rows = section.querySelector("ul.rows")!;
  rows.toggleAttribute("hidden", mode === "table");
  if (mode !== "table") rows.setAttribute("data-mode", mode);
  section.querySelector(".table")?.toggleAttribute("hidden", mode !== "table");
}

// The holons as a table: each a row, its title a link, then what it keeps under each key.
function tableOf(
  io: IO,
  ids: string[],
  keys: string[],
  reads: ReadonlyMap<string, Summed>,
  hidden: boolean,
): Node {
  const cell = (value: Value | undefined): Child => {
    if (value === undefined || value === null) return null;
    if (typeof value === "string") return value.length > short ? `${value.slice(0, short)}…` : value;
    if (typeof value === "number" || typeof value === "boolean")
      return <span class="number">{String(value)}</span>;
    if (isRef(value)) return link(io, value.$ref);
    if (Array.isArray(value)) {
      if (value.length && value.length <= inline && value.every(isRef))
        return <span class="inline">{value.map(({ $ref }) => link(io, $ref))}</span>;
      if (saidInline(value)) return value.join(", ");
      return <span class="meta">{`${value.length.toLocaleString("en")} items`}</span>;
    }
    return <span class="meta">{`${Object.keys(value).length} fields`}</span>;
  };

  return (
    <div class="table" hidden={hidden}>
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
            const each = reads.get(id);
            return (
              <tr>
                <th scope="row">
                  <a href={hrefTo(id)} data-ref={id}>
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
  );
}

// The way a list at a place was last shown, in this browser, and for the page where the
// browser keeps nothing; kept only as a convenience.
const key = (place: string) => `glass:shown:${place}`;
const forThePage = new Map<string, Mode>();

function recalled(place?: string): Mode | undefined {
  if (!place) return undefined;
  try {
    const mode = localStorage.getItem(key(place));
    if (modes.includes(mode as Mode)) return mode as Mode;
  } catch {}
  return forThePage.get(place);
}

function remember(place: string | undefined, mode: Mode) {
  if (!place) return;
  forThePage.set(place, mode);
  try {
    localStorage.setItem(key(place), mode);
  } catch {}
}

export default value;
