// A list, each item drawn in turn by what draws it, kept in place as the list changes:
// one under another, or side by side where it is given the direction row. Each item is
// drawn at its index, so it may propose its own removal from the list.

import { h } from "../../chassis/web/jsx.ts";
import { isRef, type Value } from "../../engine/read/values.ts";
import { arrange, type Realization } from "../../chassis/web/chassis.ts";

// Made knowing the direction row by its id, as the components find it (realized.ts).
export const list =
  (row: string): Realization =>
  (given, space) => {
    const node = (<div class="list" />) as HTMLElement;

    function update([items = null, direction = null]: Value[]) {
      const each = Array.isArray(items) ? items : [items];
      node.classList.toggle("row", isRef(direction) && direction.$ref === row);
      space.redraw(() =>
        arrange(
          node,
          each.map((item, i) => space.draw(item, i)),
        ),
      );
    }

    update(given);
    return { node, update };
  };
