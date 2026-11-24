// A step of a read, said as text by print, with a × that takes it out of the read: its
// removal is proposed where the pill stands, among the steps drawn beside it; where the
// way back finds no change, the chassis marks the place fixed and the × is put away.

import { h } from "./jsx.ts";
import { q } from "../../language/shipped.ts";
import type { Realization } from "../../chassis/web/chassis.ts";

export const pill: Realization = ([step = null], io) => (
  <span class="pill">
    <code class="said">{io.read(q`print(${step})`)}</code>
    <button type="button" onClick={io.remove} aria-label="Take this step out">
      ×
    </button>
  </span>
);

export default pill;
