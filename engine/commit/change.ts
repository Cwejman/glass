// A change: what is asked to be committed, before it is judged. It writes holons, takes
// some out, and says why. A holon new to the field comes under a handle of the change's
// own, "~1", used wherever its id goes; the engine gives it its id once the change is
// judged. A holon nothing in the change holds goes into the store named by into, or the
// only store written.
//
// Every change carries at: the heads it was made from, as a read answered them, empty
// when made without reading. Each head given must be one its store has had. Strict, a
// change is refused if anything it touches moved since its at; otherwise it is taken if
// it can still stand.

import type { Holon } from "../../stores/store.ts";
import type { Heads } from "../engine.ts";

export type Change = {
  holons: Holon[];
  gone?: string[];
  says: string;
  by?: string;
  into?: string;
  at: Heads;
  strict?: boolean;
};

export const isHandle = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("~");
