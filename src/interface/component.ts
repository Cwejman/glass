import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { HolonRead, Read } from "../engine/engine.ts";

// What a component is: a module whose default draws what it is given into a
// node, with a space to work in, and which may lay a style of its own. This
// is the one contract every component draws against.

export interface Component {
  default: (given: Given, space: Space) => Node | Promise<Node>;
  style?: string;
}

// What a component is given: the holon it draws, the way it is asked to
// draw it, and whatever the whole that opened it passed along.
export interface Given {
  holon: HolonRead;
  draws: string;
  with: Json;
}

// What a component works with: a space to open for what it holds, reads of
// the field, which draw it again when what they read changes, and a way to
// place the reader.
export interface Space {
  open(id: Id, draws: string, given?: Json): HTMLElement;
  read(read: Read): Promise<Json>;
  holon(id: Id): Promise<HolonRead | null>;
  place(id: Id): Promise<void>;
}
