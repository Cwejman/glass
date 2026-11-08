// What a component is: a module whose default draws what it is given into a node,
// with a space to work in, and which may lay a style of its own. This is the one
// contract every component draws against.

import type { Expression } from "../engine/expression.ts";
import type { Answer, HolonRead, Read } from "../engine/reads.ts";
import type { Holon } from "../store/store.ts";
import type { Place } from "./address.ts";

// The stores whose components are run, and whose functions can be called: glass's
// own and the reader's. Another store's code waits until it can run apart.
export const ownStores = ["glass", "home"];

export type Component = {
  default: (given: Given<never, never>, space: Space) => Node | Promise<Node>;
  style?: string;
};

// The kinds of slot, the words a holder and the held share so neither has to know
// the other: full, drawn whole, as the place one stands in; face, seen from outside.
export type Kind = "full" | "face";

// What a slot reads: one holon, a list of holons, or a way of looking.
export type Reading = { holon: string } | { list: string[] } | { gather: Expression };

export type HolonOf<B> = Omit<HolonRead, "body"> & { body: B };

// What a component is given: what its slot reads, the kind of slot it stands in,
// what the holders above it offer, the settings its slot gave, and what it may do.
export type Given<B = Holon["body"], S = Settings> = {
  holon?: HolonOf<B>;
  list?: string[];
  gathers?: Expression;
  kind: Kind;
  offered: Offer;
  settings: S;
  may: { write: boolean };
};

// What a holder offers a slot and everything beneath it, the nearest shadowing the
// farther. A slot's kind is what is offered, a face where nothing offers otherwise.
export type Offer = { kind?: Kind; [key: string]: unknown };

export type Where = string | string[] | { gather: Expression };

export type Opening = {
  offer?: Offer;
  settings?: Settings;
  kind?: Kind;
  component?: string;
};

export type Settings = Record<string, unknown>;

// A holon a write brings into being beside it, under a handle such as "~1", which
// stands for its id anywhere in what is written.
export type Made = { id: string; instance: string[]; name?: string; body: Holon["body"] };

// What a component works with: slots to open and let go of, reads answered as their
// form says and drawn again when they change, and, where it may, its one act: a new
// version of the holon it was given, in one commit with any new holons it points at.
// A mount the reader may write can also move, to another place: a new address.
export type Space = {
  open(where: Where, opening?: Opening): HTMLElement;
  close(slot: HTMLElement): void;
  move(place: Place): Promise<void>;
  read<R extends Read>(read: R): Promise<Answer<R>>;
  holon<B = Holon["body"]>(id: string): Promise<HolonOf<B> | null>;
  write(body: Holon["body"], made?: Made[]): Promise<void>;
};
