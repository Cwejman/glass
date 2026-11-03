import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { Body } from "../store/objects.ts";
import type { Expression, HolonRead, Read } from "../engine/engine.ts";
import type { Shape } from "../engine/types.ts";

// What a component is: a module that declares what it is, whose default
// draws what it is given into a node, with a space to work in, and which
// may lay a style of its own. This is the one contract every component
// draws against.

export interface Component {
  declared: Declaration;
  default: (given: Given<never, never>, space: Space) => Node | Promise<Node>;
  style?: string;
}

// The kinds of slot, the words a holder and the held share, so neither has
// to know the other: full, drawn whole, as the place one stands in; face,
// seen from outside, entered to go in.
export const kinds = ["full", "face"] as const;
export type Kind = (typeof kinds)[number];

// The forms a component may read the field by, beyond what it is handed.
export const readForms = ["holon", "name", "holders", "instances", "head", "gather"] as const;
export type ReadForm = (typeof readForms)[number];

// What a component declares of itself, beside its code: what it is, the
// types it takes by their names, the kinds of slot it draws in, what it is
// given, the settings it takes, each said in prose with its shape, and the
// reads it makes beyond what it is handed. The birth checks every name.
export interface Declaration {
  title: string;
  says: string;
  takes: string[];
  kinds: Kind[];
  argument?: "holon" | "list" | "selection";
  settings?: { [key: string]: { says: string; shape: Shape; optional?: boolean } };
  reads?: ReadForm[];
}

// What a slot reads: one holon, or a list of holons.
export type Reading = { holon: Id } | { list: Id[] };

// A holon read with the body its type declares.
export type HolonOf<B> = Omit<HolonRead, "body"> & { body: B };

// What a component is given: what its slot reads, the holon or the list;
// the kind of slot it stands in; what the holders above it offer; the
// settings the slot that opened it gave, checked against those the
// component declares; and what it may do, as a fact it is told, never one
// it works out: whether it may write the holon it was given. A component
// names the body it draws and the settings it takes, and is given them as
// those.
export interface Given<B = Body, S = Settings> {
  holon?: HolonOf<B>;
  list?: Id[];
  kind: Kind;
  offered: Offer;
  settings: S;
  may: { write: boolean };
}

// What a holder offers a slot and everything beneath it. Offers trickle
// down, and the nearest shadows the farther: so the kind of a slot is what
// its holders offer, face where nothing offers otherwise, unless the slot
// itself says.
export type Offer = { kind?: Kind; [key: string]: Json | undefined };

// Where a slot reads: one holon by its id, or several by theirs.
export type Where = Id | Id[];

// How a slot is opened: what its holder offers it and what lies beneath,
// the settings it gives the component drawn in it, the slot's own word on
// its kind, which comes before any offer, and the component it calls, where
// it names one.
export interface Opening {
  offer?: Offer;
  settings?: Settings;
  kind?: Kind;
  component?: Id;
}

// Settings a slot gives the component drawn in it.
export type Settings = { [key: string]: Json };

// What each read answers, by its form.
export type Answer<R extends Read> = R extends { holon: Id }
  ? HolonRead | null
  : R extends { name: string }
    ? Id | null
    : R extends { holders: Id }
      ? { id: Id; key: string; pinned?: Name }[]
      : R extends { instances: Id } | { gather: Expression }
        ? Id[]
        : R extends { head: string }
          ? Name | null
          : never;

// What a component works with: slots to open where what it holds stands;
// reads of the field, answered as their form says and drawing it again when
// what they read changes; and, where it may, a new version of the holon it
// was given, its one act.
export interface Space {
  open(where: Where, opening?: Opening): HTMLElement;
  read<R extends Read>(read: R): Promise<Answer<R>>;
  holon<B = Body>(id: Id): Promise<HolonOf<B> | null>;
  write(body: Body): Promise<void>;
}
