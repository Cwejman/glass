// The bodies of the field's types, made from the types by `bun run declare`.
// Never written by hand: change a type, and declare again.

import type { Json } from "../../src/store/canonical.ts";
import type { Expression } from "../../src/engine/engine.ts";

// A reference to a holon, pinned to one version where it says so.
export type Ref = { $ref: string; "@"?: string };

/** One piece of prose giving one understanding, under the rule: its face is its title and first paragraph, and what stands beneath it, its parts, are briefs in the order each stands on those before. */
export interface BriefBody {
  /** The heading: the understanding in a few words. */
  title: string;
  /** The understanding itself, in markdown. A link standing alone in a paragraph places a part there; a link in a sentence only mentions. */
  prose: string;
  /** The briefs beneath, in order, each standing on those before it. */
  parts?: Ref[];
  /** Where the brief stands, when it is not yet in force, as proposed. */
  status?: string;
  /** Where the holon was born from, as a path in the files it arrived from. */
  from?: string;
}

/** A holon that declares the types it takes and draws what it is given, opening space in it where what it holds is drawn in turn by the components that match. */
export interface ComponentBody {
  /** What the component is called. */
  title: string;
  /** What it draws, in a sentence. */
  says: string;
  /** The types whose instances it draws; none means it draws any holon, when nothing closer matches. */
  takes: Ref[];
  /** The kinds of slot it draws in, as full or face. */
  kinds: Ref[];
  /** What a mount of it is given: one holon, a list of holons, or the field itself; one holon unless it says otherwise. */
  argument?: string;
  /** The settings it takes from the slot that opens it, each said in prose with its shape, as a type declares its fields; none unless it says. */
  settings?: Json;
  /** The reads it makes of the field beyond what it is handed, by their forms, as holders or instances: what it may look at, said where it can be seen. None unless it says. */
  reads?: string[];
  /** The module the interface runs, as JavaScript. */
  code: string;
  /** The code as it was written, before it was built. */
  source?: string;
  /** Where the holon was born from, as a path in the files it arrived from. */
  from?: string;
}

/** A kind of slot: how what stands in a slot is drawn, said between the one that holds it and the one held, so neither has to know the other. */
export interface KindBody {
  /** What the kind is called. */
  title: string;
  /** How what stands in a slot of this kind is drawn, in a sentence. */
  says: string;
  /** Where the holon was born from, as a path in the files it arrived from. */
  from?: string;
}

/** Mounts held as data: each a component called with what it reads, a holon or the field itself. The layout a client boots into is the store's entry, and the reader's own arrangement is a layout in their home. */
export interface LayoutBody {
  /** What the layout is called. */
  title: string;
  /** Each mount, drawn in order: what it reads, a holon, what an expression gathers, or the field itself, and, where it says so, the kind of slot it is and the component it calls. */
  mounts: {
    /** The component the mount calls, when it names one. */
    component?: Ref;
    /** The holon the mount reads. */
    reads?: Ref;
    /** A place the engine shows instead of a holon, as the field itself. */
    projects?: string;
    /** The kind of slot the mount is, where it says so; full unless it does. */
    kind?: Ref;
    /** What the mount gathers instead of one holon, as an expression: the holons it gives are drawn as a list. */
    gathers?: Expression;
    /** The settings the mount gives the component drawn in it, as that component declares them. */
    settings?: Json;
  }[];
  /** Where the holon was born from, as a path in the files it arrived from. */
  from?: string;
}

/** What everything drawn is made of: the colours, the type, the measure and the spacing, named once so every component draws with the same material. */
export interface MaterialBody {
  /** What the material is called. */
  title: string;
  /** What the material is, in a sentence. */
  says: string;
  /** The style sheet it lays: the names every component draws with, and the page's own ground and type. */
  css: string;
  /** Where the holon was born from, as a path in the files it arrived from. */
  from?: string;
}

/** Knowledge kept in the order of time rather than by importance, like the author's words kept by day. */
export interface RecordBody {
  /** What is recorded, in a few words. */
  title: string;
  /** What the record holds, in markdown, its entries placed by links standing alone. */
  prose: string;
  /** The entries beneath, in the order they were kept. */
  parts?: Ref[];
  /** Where the holon was born from, as a path in the files it arrived from. */
  from?: string;
}

/** A schema in the field: the structure a holon's data has. Each field is said in prose beside its shape, for the fields are where holons connect. */
export interface TypeBody {
  /** What the type is called. */
  title: string;
  /** What an instance of the type is, in a sentence or two. */
  says: string;
  /** Each field an instance holds: what the key means, said in prose, and the shape the engine checks. */
  fields: Json;
  /** Where the holon was born from, as a path in the files it arrived from. */
  from?: string;
}

/** The settings the Brief component takes from the slot that opens it. */
export interface BriefSettings {
  /** Its number where it stands among its whole's parts, as 2.3, drawn before its title as a face. */
  number?: string;
}

/** The settings the Layout component takes from the slot that opens it. */
export interface LayoutSettings {
  /** Whether the layout is the page itself, which stands nowhere and so has no way down to it. */
  alone?: boolean;
}

/** The settings the List component takes from the slot that opens it. */
export interface ListSettings {
  /** The kind of slot each item is, face unless it says full. */
  kind?: string;
  /** Whether each item is numbered by its place. */
  numbered?: boolean;
  /** The number of the whole whose items these are, which each item's number runs on from. */
  number?: string;
}
