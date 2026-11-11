import type { Given, Space } from "../interface/component.ts";
import { h } from "./jsx.ts";
import { block, inline, refsOf } from "./prose.tsx";

// One utterance: its place in the session, how it came and whose voice, and its words.
// Seen from above, its place and how it came, and the first of its words.

export const declared = {
  name: "Utterance",
  says: "One utterance: its place, how it came and whose voice, and its own words; seen from above, its first words.",
  takes: ["utterance"],
  kinds: ["full", "face"],
  reads: ["whole", "holon"],
};

export default async function draw(given: Given, space: Space) {
  const utterance = given.holon!;
  const { order, as, voice } = utterance.body;
  const { holons } = await space.read({ whole: utterance.id });
  const flow = refsOf(utterance.body.flow);
  const how = as === "answered by the session" ? "answered" : as;

  if (given.kind === "face") {
    const first = flow.find((id) => holons[id]?.types.includes("paragraph"));
    const words = first ? refsOf(holons[first]!.body.sentences).slice(0, 1) : [];

    return (
      <div class="card">
        <strong>{`${order}. ${how}`}</strong>
        <span class="meta">{words.map((id) => inline(holons, id))}</span>
      </div>
    );
  }

  const speaker = voice ? await space.holon(voice.$ref) : null;

  return (
    <article class="place reader">
      <p class="meta">{[`Utterance ${order}`, how, speaker?.name].filter(Boolean).join(" · ")}</p>
      {flow.map((id) => block(holons, id))}
    </article>
  );
}
