// The fallback for any value. A holon is drawn as a record, read live: its name, a quiet
// line of its types and store, what it says, then its body key by key, each key beside
// its value; a type adds the fields it takes. Any other value is drawn as what it is:
// words, a number, a list item by item, a record field by field, a drawing within it as
// the component it names. A list of holons is drawn as rows, each its name, what it is
// and what it says; a few of them within a record, inline.
//
// A holon referred to anywhere is a link, ?q=@id, so moving between holons is following
// links, and the browser keeps the way back. Each link and row says the name of the holon
// it leads to, or what it is where it has none: what is drawn is put in place only once
// those are read, so no id shows on the way. An id is the inspector's to show.

import { h, type Child } from "../../components/jsx.ts";
import type { Answer } from "../../engine/next/engine.ts";
import { isRecord, isRef, ref, type Value } from "../../engine/next/read/values.ts";
import { applying, applyingEach } from "./carried.ts";
import { arrange, isDrawing, note, type Realization, type Space } from "./chassis.ts";

// So many items of a list or a record are drawn, and the rest counted.
const most = 200;
// So many holons a list may hold and still be said inline, within a record.
const inline = 4;
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

// A value given to be drawn on its own: a list of holons as rows, nothing said as such.
function topDrawn(shown: Value, space: Space): Node {
  if (shown === null) return note("Nothing.");
  if (Array.isArray(shown) && shown.length === 0) return note("An empty list.");
  if (Array.isArray(shown) && shown.every(isRef)) return rows(shown.map(({ $ref }) => $ref));
  return <div class="shown">{drawer(space)(shown)}</div>;
}

// A holon as the native holon reads it: its name, its types and store, what it says,
// then its body, and the fields it takes where it is a type.
function holonDrawn(answer: Answer, space: Space): Node {
  if (!("value" in answer)) return note(answer.problem);
  if (!isRecord(answer.value)) return note("No store mounted here keeps this holon.");

  const { id, name, store, instance, body, mould } = answer.value as Record<string, Value>;
  const types = Array.isArray(instance) ? instance.map(String) : [];
  const own = isRecord(body) ? (body as Record<string, Value>) : {};
  const says = typeof own.says === "string" ? own.says : undefined;
  const fields = Object.entries(own).filter(([key]) => !(key === "says" && says !== undefined));
  const takes = Object.entries(isRecord(mould) ? mould : {});
  const valueOf = drawer(space);

  return (
    <article class="holon" data-holon={String(id)}>
      <header>
        <h1>{typeof name === "string" ? name : "Unnamed"}</h1>
        <p class="kind">
          {mould ? <span>type</span> : null}
          {types.map((type) => link(type))}
          {store && store !== name ? <span>{`in ${store}`}</span> : null}
        </p>
        {says && <p class="lede">{says}</p>}
      </header>
      {fields.length ? (
        <dl class="fields">
          {fields.map(([key, inner]) => (
            <div>
              <dt>{key}</dt>
              <dd>{valueOf(inner)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        !takes.length && <p class="note">It keeps nothing beyond its name.</p>
      )}
      {takes.length > 0 && (
        <section class="takes">
          <h2>{`What each ${typeof name === "string" ? name : "one"} keeps`}</h2>
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

// A value as what it is, each drawing in it drawn by the space, at the next index.
function drawer(space?: Space) {
  let drawn = 0;

  return function drawnOf(value: Value): Child {
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
        return ids.length <= inline ? <span class="inline">{ids.map((id) => link(id))}</span> : rows(ids);
      }
      const short = value.every((item) => typeof item === "number" || typeof item === "string");
      if (short && value.length <= 8 && value.join(", ").length < 80)
        return <span class="inline">{value.map((item) => drawnOf(item))}</span>;
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
      <dl class="fields">
        {fields.slice(0, most).map(([key, inner]) => (
          <div>
            <dt>{key}</dt>
            <dd>{drawnOf(inner)}</dd>
          </div>
        ))}
        {fields.length > most && <p class="meta">{`${fields.length - most} more`}</p>}
      </dl>
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

// Holons as rows, each a link: its name, what it is, and what it says.
const rows = (ids: string[]) => (
  <ul class="rows">
    {ids.slice(0, most).map((id) => (
      <li>
        <a class="card" href={`?q=@${id}`} data-ref={id} data-row="">
          <span class="card-name">…</span>
          <span class="card-kind" />
          <span class="card-says" />
        </a>
      </li>
    ))}
    {ids.length > most && <li class="meta">{`${ids.length - most} more`}</li>}
  </ul>
);

// A holon as a link or a row says it.
type Said = { name?: string; types: string[]; store?: string; says?: string };

// The links and rows within a node, each given what it says of the holon it leads to;
// done once read, or once waiting has been long enough, whichever is first.
function named(within: Node, space: Space): Promise<void> | undefined {
  const links = [...(within as Element).querySelectorAll<HTMLAnchorElement>("a[data-ref]")];
  const ids = [...new Set(links.map((each) => each.dataset.ref!))];
  if (!ids.length) return;

  const reading = space
    .read(
      applyingEach(
        space.glass,
        "holon",
        ids.map((id) => [ref(id)]),
      ),
    )
    .then(async (answer) => {
      const read = "value" in answer && Array.isArray(answer.value) ? answer.value : [];
      const byId = new Map(ids.map((id, i) => [id, saidOf(read[i] ?? null)]));
      for (const each of links) said(each, byId.get(each.dataset.ref!));

      const uses = links.filter(
        (each) => each.hasAttribute("data-held") && byId.get(each.dataset.ref!)?.types.includes("use"),
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
    })
    .catch(() => {
      for (const each of links) said(each, undefined);
    });
  return Promise.race([reading, new Promise<void>((done) => setTimeout(done, patience))]);
}

function saidOf(read: Value): Said | undefined {
  if (!isRecord(read)) return undefined;
  const { name, types, store, body } = read as Record<string, Value>;
  const kept = isRecord(body) ? (body as Record<string, Value>) : {};
  const says = typeof kept.says === "string" ? kept.says : undefined;
  return {
    ...(typeof name === "string" && { name }),
    types: Array.isArray(types) ? types.filter((type): type is string => typeof type === "string") : [],
    ...(typeof store === "string" && { store }),
    ...(says && { says }),
  };
}

// What a holon is called where it has no name: what it is.
const called = (read: Said | undefined, id: string) =>
  read?.name ??
  (read?.types[0] ? `a ${read.types.filter((type) => type !== "type")[0] ?? "type"}` : `@${id}`);

function said(each: HTMLAnchorElement, read: Said | undefined) {
  const id = each.dataset.ref!;
  if (!each.hasAttribute("data-row")) {
    each.textContent = called(read, id);
    if (!read?.name) each.classList.add("unnamed");
    return;
  }
  each.querySelector(".card-name")!.textContent = called(read, id);
  const root = read?.name !== undefined && read.name === read.store;
  each.querySelector(".card-kind")!.textContent = [
    read?.types.join(", "),
    !root && read?.store && `in ${read.store}`,
  ]
    .filter(Boolean)
    .join(" · ");
  each.querySelector(".card-says")!.textContent = read?.says ?? "";
}
