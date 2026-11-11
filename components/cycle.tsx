import type { Given, Space } from "../interface/component.ts";
import { h } from "./jsx.ts";
import { refsOf } from "./prose.tsx";

// One cycle of a session: a stretch of work that ends with everything in the field and
// committed. Seen from above, its step, where it stands, when it ran and what it set out
// to do; in full, the utterances it spans as well, each a face to read.

export const declared = {
  name: "Cycle",
  says: "One cycle of a session: its step, where it stands, when it ran and what it set out to do; in full, the utterances it spans.",
  takes: ["cycle"],
  kinds: ["full", "face"],
  reads: ["holon"],
};

// A moment as a reader says it: the time of day, in the reader's own zone.
const timeOf = (moment: unknown) =>
  typeof moment === "string"
    ? new Date(moment).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

export default async function draw(given: Given, space: Space) {
  const cycle = given.holon!;
  const { step, purpose, began, ended, stands } = cycle.body;
  const when = ended ? `${timeOf(began)} – ${timeOf(ended)}` : `since ${timeOf(began)}`;
  const standing = [stands, when].filter(Boolean).join(" · ");

  if (given.kind === "face") {
    return (
      <div class="card">
        <strong>{step ?? cycle.name ?? "A cycle"}</strong>
        <span class="meta">{standing}</span>
        <span>{purpose}</span>
      </div>
    );
  }

  return (
    <article class="place reader">
      <h1>{step ?? cycle.name ?? "A cycle"}</h1>
      <p class="meta">{standing}</p>
      <p>{purpose}</p>
      <ol class="list">
        {refsOf(cycle.body.said).map((id) => (
          <li>{space.open(id, { offer: { kind: "face" } })}</li>
        ))}
      </ol>
    </article>
  );
}
