// The components that could draw a value, for the person to choose the one that does:
// each a button saying its name, and what it says it draws. The pick is the chassis's to
// keep, for the page.

import { h } from "./jsx.ts";
import { isRef, ref } from "../../engine/read/values.ts";
import { q } from "../../language/shipped.ts";
import type { Realization } from "../../chassis/web/chassis.ts";

export const choose: Realization = ([components = null], io) => (
  <div class="choose">
    <span class="meta">Drawn by</span>
    {(Array.isArray(components) ? components : []).filter(isRef).map(({ $ref: id }) => {
      const name = io.read(q`${ref(id)}.name`);
      const says = io.read(q`${ref(id)}.says`);
      return (
        <button
          type="button"
          data-key={id}
          title={typeof says === "string" ? says : ""}
          onClick={() => io.pick(id)}
        >
          {typeof name === "string" ? name : `@${id}`}
        </button>
      );
    })}
  </div>
);
