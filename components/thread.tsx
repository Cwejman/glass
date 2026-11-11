import type { Given, Space } from "../interface/component.ts";
import { h } from "./jsx.ts";
import { inline, refsOf } from "./prose.tsx";

// One thread: a question held open in the field. Seen from above, what it is called,
// where it stands, whether it waits on the author, and what it asks; in full, the
// sentences it was raised in as well.

export const declared = {
  name: "Thread",
  says: "One thread: what it asks and where it stands, and whether it waits on the author; in full, the sentences it was raised in.",
  takes: ["thread"],
  kinds: ["full", "face"],
  reads: ["whole"],
};

export default async function draw(given: Given, space: Space) {
  const thread = given.holon!;
  const { asks, stands, awaits } = thread.body;
  const standing = [stands, awaits ? "waits on the author" : ""].filter(Boolean).join(" · ");

  if (given.kind === "face") {
    return (
      <div class="card">
        <strong>{thread.name ?? "A thread"}</strong>
        <span class="meta">{standing}</span>
        <span>{asks}</span>
      </div>
    );
  }

  const raised = refsOf(thread.body.raised);
  const sentences = await Promise.all(raised.map((id) => space.read({ whole: id })));

  return (
    <article class="place reader">
      <h1>{thread.name ?? "A thread"}</h1>
      <p class="meta">{standing}</p>
      <p>{asks}</p>
      <p class="meta">Raised in</p>
      {sentences.map(({ root, holons }) => (
        <blockquote>{inline(holons, root)}</blockquote>
      ))}
    </article>
  );
}
