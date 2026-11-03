import type { Json } from "../store/canonical.ts";
import type { Id } from "../store/id.ts";
import type { Name } from "../store/name.ts";
import type { Body } from "../store/objects.ts";
import type { Expression, FieldPlace, HolonRead, Read } from "../engine/engine.ts";
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
export const readForms = ["holon", "name", "holders", "instances", "head", "field", "gather"] as const;
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
  argument?: "holon" | "list" | "field";
  settings?: { [key: string]: { says: string; shape: Shape; optional?: boolean } };
  reads?: ReadForm[];
}

// What a slot reads: one holon, a list of holons, what an expression
// gathers, which is drawn as a list, or the field itself.
export type Reading = { holon: Id } | { list: Id[] } | { gather: Expression } | { field: true };

// A holon read with the body its type declares.
export type HolonOf<B> = Omit<HolonRead, "body"> & { body: B };

// What a component is given: what its slot reads, the holon, the list or
// the field, the kind of slot it stands in, and the settings the slot that
// opened it gave, checked against those the component declares. A
// component names the body it draws and the settings it takes, and is
// given them as those.
export interface Given<B = Body, S = Settings> {
  holon?: HolonOf<B>;
  list?: Id[];
  field?: FieldPlace;
  kind: Kind;
  settings: S;
}

// Settings a slot gives the component drawn in it.
export type Settings = { [key: string]: Json };

// Where a move places the reader: on a holon, or at the field itself.
export type Target = Id | "field";

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
          : FieldPlace;

// What a component works with: slots to open for what it holds, one holon,
// a list of them or what an expression gathers, each of the kind it says;
// a layout's own mounts, each opened as the slot the mount says it is;
// reads of the field, answered as their form says and drawing it again when
// what they read changes; and a way to place the reader, which the
// interface carries out as the reader's move, not the component's act.
export interface Space {
  open(id: Id, kind: Kind, settings?: Settings): HTMLElement;
  openList(ids: Id[], kind: Kind, settings?: Settings): HTMLElement;
  openGathered(expression: Expression, kind: Kind, settings?: Settings): HTMLElement;
  openMount(index: number): HTMLElement;
  read<R extends Read>(read: R): Promise<Answer<R>>;
  holon<B = Body>(id: Id): Promise<HolonOf<B> | null>;
  place(to: Target): Promise<void>;
}
