// A list, each item drawn in turn by what draws it, kept in place as the list changes.

import { h } from "../../components/jsx.ts";
import type { Value } from "../../engine/next/read/values.ts";
import { arrange, type Realization } from "./chassis.ts";

export const list: Realization = (given, space) => {
  const node = (<div class="list" />) as HTMLElement;

  function update([items = null]: Value[]) {
    const each = Array.isArray(items) ? items : [items];
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
