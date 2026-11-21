// A string buffer: a buffer holding a string as it is typed, such as the query in the
// search bar. The string is one holon, of no type, named text and its body's text the
// string, so it is addressed as @name:text; it is read as a string by get(holon, "text"),
// and each keystroke is a change writing it again, the buffer keeping only the latest.
//
// Once holons are read as the type asked (Knowledge, What comes next), the holon would be
// read as a string itself: asked as one, its text is what it gives, and a reader need not
// know the key the buffer keeps it under.

import type { Change } from "../../engine/commit/change.ts";
import type { Heads } from "../../engine/engine.ts";

// The change that begins a string buffer mounted under a name: its root, an instance of
// the type store, named as the mount, holding the holon its string is kept in, empty, and
// a shape of its own naming no types, so the buffer admits any. Types are given by id, as
// the field holds them. Once committed, the change's ids give the holon's under "~2".
export function begun(name: string, types: { store: string; shape: string }): Change {
  return {
    holons: [
      {
        id: "~1",
        instance: [types.store],
        name,
        body: { shape: { $ref: "~3" }, contents: [{ $ref: "~2", $holds: true }] },
      },
      { id: "~2", instance: [], name: "text", body: { text: "" } },
      { id: "~3", instance: [types.shape], name: `${name}'s own`, body: {} },
    ],
    says: `the string buffer ${name} begun`,
    into: name,
    at: {},
  };
}

// The change that holds a string as what is typed, in place of what was.
export function typed(holon: string, text: string, at: Heads = {}): Change {
  return { holons: [{ id: holon, instance: [], name: "text", body: { text } }], says: "typed", at };
}
