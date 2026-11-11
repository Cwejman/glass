import type { Given, Space } from "../interface/component.ts";
import { h } from "./jsx.ts";
import { call, functionsIn, native } from "./parts.ts";

// An attached store, seen from outside: what it is called and where it comes from. A
// store is not a holon, so its face is a doorway: pressed, it leads to the store looked
// at, which is seen at its level, what nothing in it holds.

export const declared = {
  name: "Attachment",
  says: "A store the engine holds, as a face: what it is called and where it comes from, pressed to look at the store.",
  takes: ["attachment"],
  kinds: ["face"],
  reads: ["holon", "instances"],
};

type AttachmentBody = { key: string; from: string };

export default async function draw(given: Given<AttachmentBody>, space: Space) {
  const { key, from } = given.holon!.body;
  const store = native(await functionsIn(space, given.offered), "store");

  return (
    <div class="card" data-expression={JSON.stringify(call(store, key))}>
      <strong>{key}</strong>
      <span class="meta">{from}</span>
    </div>
  );
}
