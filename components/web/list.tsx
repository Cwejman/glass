// A list, each item drawn in turn by what draws it, kept in place as the list changes:
// one under another, or side by side where it is given the direction row. Each item is
// drawn at its index, so it may propose its own removal from the list.

import { h } from "./jsx.ts";
import { isRef } from "../../engine/read/values.ts";
import type { Realization } from "../../chassis/web/chassis.ts";

// Made knowing the direction row by its id, as the components find it (realized.ts).
export const list =
  (row: string): Realization =>
  ([items = null, direction = null], io) => (
    <div class={isRef(direction) && direction.$ref === row ? "list row" : "list"}>
      {(Array.isArray(items) ? items : [items]).map((item, i) => io.draw(item, i))}
    </div>
  );
