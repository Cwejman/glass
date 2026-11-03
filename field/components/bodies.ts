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
  /** How its parts stand, where not each on those before it: by time, as a day's words or a history's stories, kept in the order they came and not numbered. */
  kept?: string;
  /** Where the holon was born from, as a path in the files it arrived from. */
  from?: string;
}

/** A holon that declares the types it takes and draws what it is given, opening space in it where what it holds is drawn in turn by the components that match. It is made of code, or of data: mounts held as its template. */
export interface ComponentBody {
  /** What the component is called. */
  title: string;
  /** What it draws, in a sentence. */
  says: string;
  /** The types whose instances it draws; none means it draws any holon, when nothing closer matches. */
  takes: Ref[];
  /** The kinds of slot it draws in, as full or face. */
  kinds: Ref[];
  /** What a mount of it is given: one holon, a list of holons, a selection, either, or a way of looking, with the list it gathers; one holon unless it says otherwise. */
  argument?: string;
  /** The settings it takes from the slot that opens it, each said in prose with its shape, as a type declares its fields; none unless it says. */
  settings?: Json;
  /** The reads it makes of the field beyond what it is handed, by their forms, as holders or instances: what it may look at, said where it can be seen. None unless it says. */
  reads?: string[];
  /** The module the interface runs, as JavaScript, for a component made of code. */
  code?: string;
  /** For a component made of data instead of code: the mounts it is drawn as, in order, each giving `$`, what the component itself is given, and, where it says so, the kind of slot it is and the component it calls. */
  template?: {
    /** The kind of slot the mount is, where it says so. */
    kind?: Ref;
    /** What the mount gives: `$`, what the component itself was given. */
    argument: Json;
    /** The component the mount calls, where it names one; otherwise one is found for what it is given. */
    component?: Ref;
  }[];
  /** The code as it was written, before it was built. */
  source?: string;
  /** Where the holon was born from, as a path in the files it arrived from. */
  from?: string;
}

/** A way of looking at the field, held as a holon: an expression that gathers holons, so it can be given to a mount, shown by its words, or looked through to what it gathers. */
export interface ExpressionBody {
  /** What the way of looking is called. */
  title: string;
  /** The expression itself: what it gathers from the field. */
  gathers: Expression;
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

/** A call: a component and what it gives it to draw, holons in order or a way of looking. One holon is drawn as itself, several as a list, a way of looking as what it gathers. A mount is the one thing that stands still to be changed, so the root of what one looks at is a mount, and every move is a new version of it. */
export interface MountBody {
  /** What the mount is called. */
  title?: string;
  /** The component the mount calls, when it names one; otherwise one is found for what it is given. */
  component?: Ref;
  /** What the component is given, where it is given holons: holons in order. */
  argument?: Ref[];
  /** What the component is given, where it is given a way of looking: the expression itself, held in the mount, so a place one looks at needs no holon of its own. */
  gathers?: Expression;
  /** What the mount offers everything it draws, nearer offers shadowing it: settings a component takes and its slot leaves unsaid, by their names, and what components look for, as the favorites, or the search a mount's menu is drawn by. */
  offer?: Json;
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

/** The settings the List component takes from the slot that opens it. */
export interface ListSettings {
  /** Whether each item is numbered by its place. */
  numbered?: boolean;
  /** The number of the whole whose items these are, which each item's number runs on from. */
  number?: string;
  /** Whether its items stand as cards side by side, where there is room, rather than one under another. */
  cards?: boolean;
}

/** The settings the Search component takes from the slot that opens it. */
export interface SearchSettings {
  /** The component the place is drawn by where it was pressed, whose settings it offers to set. */
  drawn?: Ref;
  /** The settings the place's slot gave already, which no offer reaches, so are not offered to set. */
  said?: string[];
  /** Whether it was laid where something was pressed: it takes the focus, and offers first what can be done there. */
  pressed?: boolean;
}
