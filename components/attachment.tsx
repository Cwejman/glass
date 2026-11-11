import type { Given, Space } from "../interface/component.ts";
import { h } from "./jsx.ts";
import { call, functionsIn, native } from "./parts.ts";

// An attached store, seen from outside: what it is called and where it comes from.
// Pressed, it leads to the store's root, which says what the store holds; a store with
// no root is looked at instead, at its level, what nothing in it holds.

export const declared = {
  name: "Attachment",
  says: "A store the engine holds, as a face: what it is called and where it comes from, pressed to go to its root, or to look at the store where it has none.",
  takes: ["attachment"],
  kinds: ["face"],
  reads: ["holon", "instances", "named"],
};

type AttachmentBody = { key: string; from: string };

export default async function draw(given: Given<AttachmentBody>, space: Space) {
  const { key, from } = given.holon!.body;
  const [storeType] = await space
    .read({ named: "store", store: "glass" })
    .then((ids) =>
      Promise.all(ids.map((id) => space.holon(id))).then((found) => found.filter((holon) => holon?.mould)),
    );
  const [root] = storeType ? await space.read({ instances: storeType.id, store: key }) : [];
  const store = native(await functionsIn(space, given.offered), "store");
  const leads = root
    ? { "data-location": JSON.stringify([root]) }
    : { "data-expression": JSON.stringify(call(store, key)) };

  return (
    <div class="card" {...leads}>
      <strong>{key}</strong>
      <span class="meta">{from}</span>
    </div>
  );
}
