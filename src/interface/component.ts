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

// The kinds of slot, the words a holder and the held share, so neither has
// to know the other: full, drawn whole, as the place one stands in; face,
// seen from outside, entered to go in.
export type Kind = "full" | "face";

// What a component is given: what its slot reads, the holon, the list or
// the field, the kind of slot it stands in, and whatever the whole that
// opened it passed along.
export interface Given {
  holon?: HolonRead;
  list?: Id[];
  field?: FieldPlace;
  kind: Kind;
  with: Json;
}

// Where a move places the reader: on a holon, or at the field itself.
export type Target = Id | "field";

// What a component works with: slots to open for what it holds, one holon
// or a list of them, each of the kind it says; a layout's own mounts, each
// opened as the slot the mount says it is; reads of the field, which draw
// it again when what they read changes; and a way to place the reader.
export interface Space {
  open(id: Id, kind: Kind, passed?: Json): HTMLElement;
  openList(ids: Id[], kind: Kind, passed?: Json): HTMLElement;
  openMount(index: number): HTMLElement;
  read(read: Read): Promise<Json>;
  holon(id: Id): Promise<HolonRead | null>;
  place(to: Target): Promise<void>;
}
