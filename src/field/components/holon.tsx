// Any holon, when nothing closer draws it: the wildcard. Whole, it is what the holon
// is an instance of, and every value in its body, a reference drawn as the face of
// what it points at, so everything in the field can be reached from anywhere. Prose
// held as words is read as prose. Seen from above, its name and its types.

import type { Holon } from "../../store/store.ts";
import type { Whole } from "../../engine/reads.ts";
import { isRef } from "../../engine/references.ts";
import type { Given, Space } from "../../interface/component.ts";
import { h, type Child } from "./jsx.ts";
import { block, inline } from "./prose.tsx";

export const declared = {
  name: "Holon",
  says: "Any holon nothing closer draws: what it is an instance of, and every value it holds, each reference a slot offered a face; as a face, its name and types.",
  takes: [],
  kinds: ["full", "face"],
  reads: ["holon", "whole"],
};

export const style = `
.values {
  margin: 0;
  display: grid;
  gap: var(--gap);
}

.values dt {
  font: var(--small) / var(--leading-close) var(--mono);
  color: var(--quiet);
}

.values dd {
  margin: 0.25em 0 0;
}

.values ol {
  margin: 0;
  padding-left: 1.2em;
  display: grid;
  gap: calc(var(--gap) * 0.5);
}
`;

export default async function draw(given: Given, space: Space) {
  const holon = given.holon!;
  const what = `${holon.types.join(", ") || "a holon"} · in ${holon.store}`;

  // A name says enough for a face, so nothing beneath it is fetched.
  if (given.kind === "face" && holon.name) return card(holon.name, what);

  const { holons } = await space.read({ whole: holon.id, stop: ["brief", "session"] });
  const title = holon.name ?? glance(holons, holon.id) ?? holon.id;

  if (given.kind === "face") return card(title, what);

  const prose = block(holons, holon.id);

  return (
    <article class="place holon reader">
      <h1>{title}</h1>
      <p class="meta">{what}</p>

      {prose ?? [
        holon.instance.length > 0 && <h2>Is an instance of</h2>,
        holon.instance.length > 0 && space.open(holon.instance, { offer: { kind: "face" } }),

        <h2>Holds</h2>,
        <Values of={holon.body} holons={holons} space={space} />,
      ]}
    </article>
  );
}

const card = (title: string, what: string) => (
  <div class="card">
    <strong>{title}</strong>
    <span class="meta">{what}</span>
  </div>
);

// The opening words of what a nameless holon holds, so it can be told apart at a glance.
function glance(holons: Whole["holons"], id: string) {
  const text = (node: Child): string =>
    Array.isArray(node)
      ? node.map(text).join("")
      : typeof node === "string"
        ? node
        : ((node as Node | null)?.textContent ?? "");
  const said = text(inline(holons, id)).trim();

  return said ? said.slice(0, 80) + (said.length > 80 ? "…" : "") : null;
}

function Values({ of, holons, space }: { of: Holon["body"]; holons: Whole["holons"]; space: Space }) {
  return (
    <dl class="values">
      {Object.entries(of).map(([key, value]) => [<dt>{key}</dt>, <dd>{valueOf(value, holons, space)}</dd>])}
    </dl>
  );
}

function valueOf(value: unknown, holons: Whole["holons"], space: Space): Child {
  if (isRef(value)) return block(holons, value.$ref) ?? space.open(value.$ref, { offer: { kind: "face" } });

  if (Array.isArray(value)) {
    if (value.length > 0 && value.every(isRef)) {
      const ids = value.map(({ $ref }) => $ref);

      return ids.every((id) => holons[id] && block(holons, id))
        ? ids.map((id) => block(holons, id))
        : space.open(ids, { offer: { kind: "face" } });
    }

    return (
      <ol>
        {value.map((item) => (
          <li>{valueOf(item, holons, space)}</li>
        ))}
      </ol>
    );
  }

  if (typeof value === "object" && value !== null)
    return <Values of={value as Holon["body"]} holons={holons} space={space} />;

  if (typeof value === "string" && (value.length > 160 || value.includes("\n"))) return <p>{value}</p>;

  return String(value);
}
