// The reads the interface writes itself. Each carries what it applies until the field
// holds it: the types a use, a function and a component are of, the natives no store
// keeps a function for yet (holon, get and parse), and the component answer. Every
// holon carried is under a handle of its own, so none is taken for a holon of the field,
// and none is found by its name.

import type { Read } from "../../engine/next/engine.ts";
import type { Value } from "../../engine/next/read/values.ts";
import type { Holon } from "../../stores/store.ts";

// The component answer: given a read, it draws what the read gives.
export const answer = "~answer";

const declared = { says: "", shape: "json", optional: true };

const types: Holon[] = [
  { id: "~use", instance: [], name: "use", mould: { fn: declared, args: declared }, body: {} },
  { id: "~function", instance: [], name: "function", mould: { input: declared }, body: {} },
  { id: "~component", instance: [], name: "component", mould: { input: declared }, body: {} },
];

const native = (name: string): Holon => ({ id: `~${name}`, instance: ["~function"], body: { native: name } });

const answering: Holon = {
  id: answer,
  instance: ["~component"],
  name: "answer",
  body: { says: "A read, drawn as what it gives, again whenever that changes." },
};

const use = (id: string, fn: string, args: unknown[]): Holon => ({
  id,
  instance: ["~use"],
  body: { fn: { $ref: fn }, args },
});

const held = (id: string) => ({ $ref: id, $holds: true });

// A native applied to values.
export function applying(name: string, ...args: Value[]): Read {
  return { gives: held("~1"), holons: [...types, native(name), use("~1", `~${name}`, args)] };
}

// A native applied to each list of values in turn, giving a list.
export function applyingEach(name: string, each: Value[][]): Read {
  const uses = each.map((args, i) => use(`~${i + 1}`, `~${name}`, args));
  return { gives: uses.map(({ id }) => held(id)), holons: [...types, native(name), ...uses] };
}

// The read a page draws: answer, given the text read into uses.
export function answerOf(text: string): Read {
  return {
    gives: held("~root"),
    holons: [
      ...types,
      native("parse"),
      answering,
      use("~root", answer, [held("~text")]),
      use("~text", "~parse", [text]),
    ],
  };
}
