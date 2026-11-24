// A list, each item drawn in turn by what draws it, kept in place as the list changes:
// one under another, or side by side where it is given the direction row. Each item is
// drawn at its index, so it may propose its own removal from the list.

import { h } from "./jsx.ts";
import { q } from "../../language/shipped.ts";
import type { Realization } from "../../chassis/web/chassis.ts";

export const list: Realization = ([items = null, direction = null], io) => (
  <div class={direction !== null && io.read(q`${direction}.name`) === "row" ? "list row" : "list"}>
    {(Array.isArray(items) ? items : [items]).map((item, i) => io.draw(item, i))}
  </div>
);

export default list;
