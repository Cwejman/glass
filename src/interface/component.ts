import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { FieldPlace, HolonRead, Read } from "../engine/engine.ts";

// What a component is: a module whose default draws what it is given into a
// node, with a space to work in, and which may lay a style of its own. This
// is the one contract every component draws against.

export interface Component {
  default: (given: Given, space: Space) => Node | Promise<Node>;
  style?: string;
}

// What a mount reads: one holon, a list of holons, or the field itself.
export type Reading = { holon: Id } | { list: Id[] } | { field: true };

// What a component is given: what its mount reads, the holon, the list or
// the field, the way it is asked to draw it, and whatever the whole that
// opened it passed along.
export interface Given {
  holon?: HolonRead;
  list?: Id[];
  field?: FieldPlace;
  draws: string;
  with: Json;
}

// Where a move places the reader: on a holon, or at the field itself.
export type Target = Id | "field";

// What a component works with: spaces to open for what it holds, one holon
// or a list of them; reads of the field, which draw it again when what they
// read changes; and a way to place the reader.
export interface Space {
  open(id: Id, draws: string, given?: Json): HTMLElement;
  openList(ids: Id[], draws: string, given?: Json): HTMLElement;
  read(read: Read): Promise<Json>;
  holon(id: Id): Promise<HolonRead | null>;
  place(to: Target): Promise<void>;
}
