// The fallback for any value. A holon is drawn as its values, read live: its name, its
// types and store, and its body key by key. Any other value is drawn as what it is: words,
// a number, a list item by item, a record field by field, a drawing within it as the
// component it names. A holon referred to anywhere is a plain link, ?q=@id, so moving
// between holons is following links, and the browser keeps the way back. Each link says
// the name of the holon it leads to, once that is read.

import { h, type Child } from "../../components/jsx.ts";
import type { Answer } from "../../engine/next/engine.ts";
import { isRecord, isRef, ref, type Value } from "../../engine/next/read/values.ts";
import { applying, applyingEach } from "./carried.ts";
import { arrange, isDrawing, note, type Realization, type Space } from "./chassis.ts";

// So many items of a list or a record are drawn, and the rest counted.
const most = 200;

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

  function update([shown = null]: Value[]) {
    if (isRef(shown)) {
      if (holon === shown.$ref) return;
      unsubscribe();
      holon = shown.$ref;

      const mine = turn;
      void space
        .subscribe(applying(space.glass, "holon", ref(holon)), (answer) => {
          if (mine === turn) space.redraw(() => arrange(node, [named(holonDrawn(answer), space)]));
        })
        .then((stopping) => (mine === turn ? (stop = stopping) : stopping()));
      return;
    }

    unsubscribe();
    space.redraw(() => arrange(node, [named(drawer(space)(shown), space)]));
  }

  update(given);
  return { node, update, dispose: unsubscribe };
};

// A holon as the native holon reads it: its name, its types and store, then its body.
function holonDrawn(answer: Answer): Node {
  if (!("value" in answer)) return note(answer.problem);
  if (!isRecord(answer.value)) return note("No store mounted here keeps this holon.");

  const { id, name, store, instance, body } = answer.value as Record<string, Value>;
  const types = Array.isArray(instance) ? instance.map(String) : [];
  const fields = Object.entries(isRecord(body) ? body : {});
  const valueOf = drawer();

  return (
    <article class="holon">
      <h1>{typeof name === "string" ? name : `@${id}`}</h1>
      <p class="meta">
        {types.map((type) => [link(type), " "])}
        {`in ${store} · `}
        <a href={`?q=@${id}`}>{`@${id}`}</a>
      </p>
      <dl class="fields">{fields.flatMap(([key, inner]) => [<dt>{key}</dt>, <dd>{valueOf(inner)}</dd>])}</dl>
    </article>
  );
}

// A value as what it is, each drawing in it drawn by the space, at the next index.
function drawer(space?: Space) {
  let drawn = 0;

  return function drawnOf(value: Value): Child {
    if (value === null || value === undefined) return <span class="meta">nothing</span>;
    if (typeof value === "string") return <span class="words">{value}</span>;
    if (typeof value === "number" || typeof value === "boolean")
      return <span class="number">{String(value)}</span>;
    if (isRef(value)) return link(value.$ref);
    if (isDrawing(value) && space) return space.draw(value, drawn++);

    if (Array.isArray(value))
      return (
        <ol class="items">
          {value.slice(0, most).map((item) => (
            <li>{drawnOf(item)}</li>
          ))}
          {value.length > most && <li class="meta">{`${value.length - most} more`}</li>}
        </ol>
      );

    const fields = Object.entries(value);
    return (
      <dl class="fields">
        {fields.slice(0, most).flatMap(([key, inner]) => [<dt>{key}</dt>, <dd>{drawnOf(inner)}</dd>])}
        {fields.length > most && [<dt />, <dd class="meta">{`${fields.length - most} more`}</dd>]}
      </dl>
    );
  };
}

const link = (id: string) => (
  <a class="ref" href={`?q=@${id}`} data-ref={id}>
    {`@${id}`}
  </a>
);

// The links within a node, each given the name of the holon it leads to, once read.
function named(node: Child, space: Space): Node {
  const within = node as Element;
  const links = [...within.querySelectorAll<HTMLAnchorElement>("a[data-ref]")];
  const ids = [...new Set(links.map((each) => each.dataset.ref!))];
  if (!ids.length) return within;

  void space
    .read(
      applyingEach(
        space.glass,
        "get",
        ids.map((id) => [ref(id), "name"]),
      ),
    )
    .then((answer) => {
      const names = "value" in answer && Array.isArray(answer.value) ? answer.value : [];
      const byId = new Map(ids.map((id, i) => [id, names[i]]));
      for (const each of links) {
        const name = byId.get(each.dataset.ref!);
        if (typeof name === "string") each.textContent = name;
      }
    });
  return within;
}
