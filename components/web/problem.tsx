// What failed, said in place of the drawing that failed: the chassis draws it wherever
// what a drawing is given, a read it asked, or its render fails.

import { h } from "./jsx.ts";
import type { Realization } from "../../chassis/web/chassis.ts";

export const problem: Realization = ([said = null]) => <p class="note problem">{String(said)}</p>;
