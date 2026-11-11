import type { Given, Space } from "../interface/component.ts";
import { h } from "./jsx.ts";
import { refsOf } from "./prose.tsx";

// A store's root: what its field holds, and the stores it stands on. Seen from above,
// its name, how many wholes it holds and what it depends on; in full, each whole it
// holds as a face to go down into, and its dependencies by name.

export const declared = {
  name: "Store",
  says: "A store by its root: the wholes it holds, each a face to go down into, and the stores it depends on; seen from above, how many it holds and what it stands on.",
  takes: ["store"],
  kinds: ["full", "face"],
  reads: ["holon"],
};

export default async function draw(given: Given, space: Space) {
  const root = given.holon!;
  const contents = refsOf(root.body.contents);
  const dependencies = await Promise.all(refsOf(root.body.dependencies).map((id) => space.holon(id)));
  const standsOn = dependencies.map((dependency) => dependency?.name).filter(Boolean);
  const said = [
    `holds ${contents.length}`,
    standsOn.length ? `stands on ${standsOn.join(", ")}` : "stands on nothing else",
  ].join(" · ");

  if (given.kind === "face") {
    return (
      <div class="card">
        <strong>{root.name ?? "A store"}</strong>
        <span class="meta">{`store · ${said}`}</span>
      </div>
    );
  }

  return (
    <article class="place reader">
      <h1>{root.name ?? "A store"}</h1>
      <p class="meta">{said}</p>
      <ol class="list cards">
        {contents.map((id) => (
          <li>{space.open(id, { offer: { kind: "face" } })}</li>
        ))}
      </ol>
    </article>
  );
}
