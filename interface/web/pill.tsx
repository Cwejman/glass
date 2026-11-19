// A step of a read, said as text by print, with a × that takes it out of the read: its
// removal is proposed where the pill stands, among the steps drawn beside it, and the
// change the way back finds is committed; where there is none, the × is put away.
//
// The × submits the form the pill is, so whoever keeps the address takes it as a step.

import { h } from "../../components/jsx.ts";
import type { Value } from "../../engine/next/read/values.ts";
import { applying } from "./carried.ts";
import { removed, type Realization } from "./chassis.ts";

export const pill: Realization = (given, space) => {
  const said = (<code class="said" />) as HTMLElement;
  const node = (
    <form class="pill" onSubmit={remove}>
      {said}
      <button type="submit" aria-label="Take this step out">
        ×
      </button>
    </form>
  ) as HTMLFormElement;
  let turn = 0;

  async function remove(event: Event) {
    event.preventDefault();
    const change = await space.propose(space.place, removed);
    if (!change) return void node.classList.add("fixed");
    await space.commit(change);
  }

  function update([step = null]: Value[]) {
    const mine = ++turn;
    void space.read(applying(space.glass, "print", step)).then((answer) => {
      if (mine !== turn) return;
      said.textContent = "value" in answer && typeof answer.value === "string" ? answer.value : "?";
    });
  }

  update(given);
  return { node, update };
};
