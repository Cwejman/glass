// A text, typed into. Each keystroke proposes what is typed as what the input is given,
// and the change the way back finds is committed; where there is none, the input is
// read-only. Keystrokes are proposed one at a time, in order, the latest typed replacing
// any still waiting, so a slower change never lands over a newer one.
//
// The texts it typed come back to it as the read answers again. Those are its own, and
// it keeps what is being typed and where the cursor stands; a text it did not type, as
// the address moving, is shown in place of what was there.
//
// Enter submits the form the input stands in, so whoever keeps the address may mark a
// step there.

import { h } from "../../components/jsx.ts";
import type { Value } from "../../engine/next/read/values.ts";
import type { Realization } from "./chassis.ts";

export const expressionInput: Realization = (given, space) => {
  const input = (
    <input
      type="text"
      name="q"
      autocomplete="off"
      spellcheck="false"
      aria-label="Expression"
      placeholder="An expression, as @Knowledge"
    />
  ) as HTMLInputElement;
  const node = (
    <form class="expression-input" role="search" onSubmit={(event: Event) => event.preventDefault()}>
      {input}
    </form>
  ) as HTMLFormElement;

  const place = { ...space.place, arg: 0 };
  // The texts proposed, in order, whose answers have not yet come back.
  let echoes: string[] = [];
  let waiting: string | undefined;
  let sending = false;

  function readOnly() {
    input.readOnly = true;
    node.classList.add("fixed");
  }

  async function send() {
    if (sending) return;
    sending = true;
    try {
      while (waiting !== undefined) {
        const text = waiting;
        waiting = undefined;
        const change = await space.propose(place, text);
        if (!change) return readOnly();
        echoes.push(text);
        await space.commit(change);
      }
    } finally {
      sending = false;
    }
  }

  input.addEventListener("input", () => {
    waiting = input.value;
    void send();
  });

  function update([text = null]: Value[]) {
    const shown = typeof text === "string" ? text : "";
    const echo = echoes.lastIndexOf(shown);
    if (echo >= 0) {
      echoes = echoes.slice(echo + 1);
      return;
    }
    if (shown !== input.value) input.value = shown;
  }

  update(given);
  void space.propose(place, input.value).then((change) => change || readOnly(), readOnly);
  return { node, update };
};
