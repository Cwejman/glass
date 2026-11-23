// The components that could draw a value, for the person to choose the one that does:
// each a button saying its name, and what it says it draws. The pick is the chassis's to
// keep: written into the use that named no component, where its store takes it.

import { h } from "../../chassis/web/jsx.ts";
import { isRef, ref, type Value } from "../../engine/read/values.ts";
import { applyingEach } from "../../language/shipped.ts";
import type { Realization } from "../../chassis/web/chassis.ts";

export const choose: Realization = (given, space) => {
  const node = (<div class="choose" />) as HTMLElement;
  let turn = 0;

  function update([components = null]: Value[]) {
    const ids = (Array.isArray(components) ? components : []).filter(isRef).map(({ $ref }) => $ref);
    const mine = ++turn;

    void space
      .read(
        applyingEach(
          space.glass,
          "get",
          ids.flatMap((id) => [
            [ref(id), "name"],
            [ref(id), "says"],
          ]),
        ),
      )
      .then((answer) => {
        if (mine !== turn) return;
        const said = "value" in answer && Array.isArray(answer.value) ? answer.value : [];
        node.replaceChildren(
          <span class="meta">Drawn by</span>,
          ...ids.map((id, i) => {
            const [name, says] = [said[2 * i], said[2 * i + 1]];
            return (
              <button
                type="button"
                title={typeof says === "string" ? says : ""}
                onClick={() => space.pick(id)}
              >
                {typeof name === "string" ? name : `@${id}`}
              </button>
            );
          }),
        );
      });
  }

  update(given);
  return { node, update };
};
