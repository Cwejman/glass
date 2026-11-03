import type { Id } from "../../src/store/id.ts";
import type { Given, Space } from "../../src/interface/component.ts";
import { h } from "./jsx.ts";
import { Card, follow, Way } from "./way.tsx";

// A type: what an instance of it is, each field it declares with what the
// field means and its shape, and its instances, a list of mounts. Seen from
// above, its title, what it says and how many instances it has.

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

interface Connector {
  says: string;
  shape: unknown;
  optional?: boolean;
}

export default async function draw(given: Given, space: Space) {
  const type = given.holon!;
  const title = String(type.body.title ?? type.id);
  const instances = (await space.read({ instances: type.id })) as Id[];

  if (given.draws === "face")
    return (
      <Card to={type.id} space={space}>
        <strong>{title}</strong>
        <span class="meta">
          {[String(type.body.says ?? ""), counted(instances.length, "instance")].filter(Boolean).join(" · ")}
        </span>
      </Card>
    );

  const fields = Object.entries((type.body.fields ?? {}) as unknown as Record<string, Connector>);
  return (
    <article class="place type" onClick={follow(space)}>
      <Way steps={[]} />
      <h1>{title}</h1>
      {type.body.says && <p>{String(type.body.says)}</p>}

      <h2>Its fields</h2>
      <dl class="type-fields">
        {fields.map(([key, connector]) => [
          <dt>
            {key}
            <span class="shape">
              {shapeOf(connector.shape)}
              {connector.optional && ", optional"}
            </span>
          </dt>,
          <dd>{connector.says}</dd>,
        ])}
      </dl>

      <h2>Its instances, {instances.length}</h2>
      {space.openList(instances, "whole", { draws: "face" })}
    </article>
  );
}

const counted = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;

function shapeOf(shape: unknown): string {
  if (typeof shape === "string") return shape;
  if (shape && typeof shape === "object" && "list" in shape) return `list of ${shapeOf(shape.list)}`;
  return "fields";
}
