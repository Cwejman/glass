// A read, drawn as what it gives, again whenever that changes. Given another read, it
// lets go of the first and keeps the second; given nothing, the read of a blank text, it
// draws nothing.

import { h } from "../../components/jsx.ts";
import type { Read } from "../../engine/next/engine.ts";
import { isRecord, type Value } from "../../engine/next/read/values.ts";
import { arrange, note, type Realization } from "./chassis.ts";

export const answer: Realization = (given, space) => {
  const node = (<div class="answer" />) as HTMLElement;
  let asked: string | undefined;
  let stop: (() => void) | undefined;
  let turn = 0;

  const unsubscribe = () => {
    turn++;
    stop?.();
    stop = undefined;
  };

  function update([read = null]: Value[]) {
    const key = JSON.stringify(read);
    if (key === asked) return;
    asked = key;
    unsubscribe();

    if (read === null) return space.redraw(() => arrange(node, []));
    if (!isRecord(read) || !("gives" in read))
      return space.redraw(() => arrange(node, [note("What answer is given is no read to draw.")]));

    const mine = turn;
    void space
      .subscribe(read as unknown as Read, (answer) => {
        if (mine !== turn) return;
        space.redraw(() =>
          arrange(node, ["value" in answer ? space.draw(answer.value) : note(answer.problem)]),
        );
      })
      .then((stopping) => (mine === turn ? (stop = stopping) : stopping()));
  }

  update(given);
  return { node, update, dispose: unsubscribe };
};
