import type { Json } from "../../src/store/canonical.ts";
import type { Id } from "../../src/store/id.ts";
import type { Declaration, Given, Space } from "../../src/interface/component.ts";
import { h, type Child } from "./jsx.ts";
import { markdown } from "./prose.ts";
import { Card, follow, Way } from "./way.tsx";

// Any holon, when nothing closer draws it: the wildcard. Whole, it is what
// the holon is an instance of, and every value in its body, a reference
// drawn as the face of what it points at, so everything in the field can be
// reached from anywhere; long text and code shown as they are. Seen from
// above, its title and its types.

export const declared = {
  title: "Holon",
  says: "Any holon nothing closer draws, the wildcard: what it is an instance of, and every value it holds, each reference a slot of what it points at.",
  takes: [],
  kinds: ["full", "face"],
  reads: ["holon"],
} satisfies Declaration;

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
  const types = await Promise.all(
    holon.instance.map(async (id: Id) => (await space.holon(id))?.body.title ?? id),
  );
  const title = String(holon.body.title ?? holon.id);
  const what = `${types.join(", ")} · in ${holon.store}`;

  if (given.kind === "face")
    return (
      <Card to={holon.id} space={space}>
        <strong>{title}</strong>
        <span class="meta">{what}</span>
      </Card>
    );

  return (
    <article class="place holon" onClick={follow(space)}>
      <Way steps={[]} />
      <h1>{title}</h1>
      <p class="meta">{what}</p>

      <h2>Is an instance of</h2>
      {space.openList(holon.instance, "full", { kind: "face" })}

      <h2>Holds</h2>
      <Values of={holon.body} space={space} />
    </article>
  );
}

// A set of values, key by key.
const Values = ({ of, space }: { of: { [key: string]: Json }; space: Space }) => (
  <dl class="values">
    {Object.entries(of).map(([key, value]) => [<dt>{key}</dt>, <dd>{valueOf(value, space)}</dd>])}
  </dl>
);

// A value as it is: a reference as the face of what it points at, a list of
// references as a list of mounts, any other list item by item, a set of
// fields key by key, prose that links into the field drawn so its links can
// be followed, long text kept in its own box, and the rest as text.
function valueOf(value: Json, space: Space): Child {
  if (isRef(value)) return refOf(value, space);

  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((item) => isRef(item) && !item["@"]))
      return space.openList(
        value.map((item) => (item as { $ref: Id }).$ref),
        "full",
        { kind: "face" },
      );
    return (
      <ol>
        {value.map((item) => (
          <li>{valueOf(item, space)}</li>
        ))}
      </ol>
    );
  }

  if (value !== null && typeof value === "object") return <Values of={value} space={space} />;

  if (typeof value === "string" && value.includes("](ref:"))
    return <div class="prose" html={markdown.parse(value) as string} />;
  if (typeof value === "string" && (value.length > 160 || value.includes("\n"))) return <pre>{value}</pre>;
  return String(value);
}

// A pinned reference says so, since what is drawn is the holon as it stands
// now, not the version it pins.
function refOf(ref: { $ref: Id; "@"?: string }, space: Space): Child {
  const face = space.open(ref.$ref, "face");
  if (!ref["@"]) return face;
  return [face, <span class="meta">pinned to {ref["@"].slice(0, 15)}…, shown as it stands now</span>];
}

const isRef = (value: Json): value is { $ref: Id; "@"?: string } =>
  typeof value === "object" && value !== null && !Array.isArray(value) && typeof value.$ref === "string";
