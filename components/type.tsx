import type { Mould, Shape } from "../engine/moulds.ts";
import type { Given, Space } from "../interface/component.ts";
import { h } from "./jsx.ts";

// A type: what an instance of it is, each field it declares with what the
// field means and its shape, and its instances, a list of mounts. Seen from
// above, its title, what it says and how many instances it has.

export const declared = {
  name: "Type",
  says: "A type: what its instances are, each field it declares with what it means and its shape, and its instances.",
  takes: ["type"],
  kinds: ["full", "face"],
  reads: ["instances"],
};

export const style = `
.type-fields {
  margin: 0;
  display: grid;
  gap: calc(var(--gap) * 0.75);
}

.type-fields dt {
  font: var(--small) / var(--leading-close) var(--mono);
}

.type-fields dt .shape {
  color: var(--quiet);
  margin-left: 0.6em;
}

.type-fields dd {
  margin: 0.15em 0 0;
  color: var(--quiet);
}
`;

export default async function draw(given: Given, space: Space) {
  const type = given.holon!;
  const says = type.body.says as string | undefined;
  const instances = await space.read({ instances: type.id });

  if (given.kind === "face") {
    return (
      <div class="card">
        <strong>{type.name}</strong>
        <span class="meta">{[says, counted(instances.length, "instance")].filter(Boolean).join(" · ")}</span>
      </div>
    );
  }

  const fields = Object.entries((type.mould ?? {}) as Mould);

  return (
    <article class="place type">
      <h1>{type.name}</h1>
      {says && <p>{says}</p>}

      <h2>Its fields</h2>
      <dl class="type-fields">
        {fields.map(([key, field]) => [
          <dt>
            {key}
            <span class="shape">
              {shapeOf(field.shape)}
              {field.holds && ", holds"}
              {field.optional && ", optional"}
            </span>
          </dt>,
          <dd>{field.says}</dd>,
        ])}
      </dl>

      <h2>Its instances, {instances.length}</h2>
      {space.open(instances, { offer: { kind: "face" } })}
    </article>
  );
}

const counted = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

function shapeOf(shape: Shape): string {
  if (typeof shape === "string") return shape;
  if ("list" in shape) return `list of ${shapeOf(shape.list as Shape)}`;
  if ("set" in shape) return `set of ${shapeOf(shape.set as Shape)}`;
  return "fields";
}
