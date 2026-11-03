import type { Expression } from "../../src/engine/engine.ts";
import type { Declaration, Given, Space } from "../../src/interface/component.ts";
import type { ExpressionBody } from "./bodies.ts";
import { h } from "./jsx.ts";

// An expression, a way of looking at the field: as a face, what it is
// called and what it gathers, said in words; in full, those, and what it
// gathers now, each a slot offered a face.

export const declared = {
  title: "Expression",
  says: "An expression: as a face, its title and its words; in full, those and what it gathers, a list of faces.",
  takes: ["expression"],
  kinds: ["full", "face"],
  reads: ["gather", "holon"],
} satisfies Declaration;

export default async function draw(given: Given<ExpressionBody>, space: Space) {
  const { title, gathers } = given.holon!.body;
  const said = await words(gathers, space);

  if (given.kind === "face")
    return (
      <div class="card">
        <strong>{title}</strong>
        <span class="meta">{said}</span>
      </div>
    );

  const gathered = await space.read({ gather: gathers });
  return (
    <article class="place expression">
      <h1>{title}</h1>
      <p class="meta">
        {said}, {gathered.length === 1 ? "one holon" : `${gathered.length} holons`}
      </p>
      {space.open(gathered, { offer: { kind: "face" } })}
    </article>
  );
}

// An expression said in words, each holon it names by its title.
async function words(expression: Expression, space: Space): Promise<string> {
  const titleOf = async (given: string | { $ref: string }) => {
    const id = typeof given === "string" ? given : given.$ref;
    return String((await space.holon(id))?.body.title ?? id);
  };
  if ("instances" in expression) return `the instances of ${await titleOf(expression.instances)}`;
  if ("types" in expression) return "every type";
  if ("pointing" in expression) return `what points at ${await titleOf(expression.pointing)}`;
  if ("named" in expression) return "every holon a store names";
  const parts = await Promise.all(
    ("all" in expression ? expression.all : expression.any).map((inner) => words(inner, space)),
  );
  return parts.join("all" in expression ? " which are also " : ", or ");
}
