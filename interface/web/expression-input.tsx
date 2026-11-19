// A text, typed into. The text it is given is what is asked so far, its steps drawn
// beside it as pills; the input holds only what is typed next: a step to add, begun
// with |, or a text of its own, asked in place of the rest. Enter proposes the text that
// makes, and the change the way back finds is committed; where there is none, the input
// is read-only. Backspace in an empty input takes the last step back into it, to be
// typed again: the text without it is proposed, and the step is said in the input as
// the language says it (steps, chain, print). Escape lets go of what is typed.
//
// A text it proposed comes back to it as the read answers again, and is its own; any
// other, as the address moving or a pill taken out, lets go of what was being typed.
//
// Enter submits the form the input stands in, so whoever keeps the address may mark a
// step there.

import { h } from "../../components/jsx.ts";
import type { Value } from "../../engine/next/read/values.ts";
import { applying } from "./carried.ts";
import type { Realization } from "./chassis.ts";

const continuing = "| add a step, or type to ask anew";
const beginning = "An expression, as @Knowledge";

// What is asked once what is typed is added to what was asked.
export function continued(asked: string, typed: string): string {
  const next = typed.trim();
  if (!next) return asked;
  if (next.startsWith("|")) return asked ? `${asked} ${next}` : next.replace(/^\|\s*/, "");
  return next;
}

export const expressionInput: Realization = (given, space) => {
  const input = (
    <input
      type="text"
      autocomplete="off"
      spellcheck="false"
      aria-label="Expression"
      placeholder={beginning}
    />
  ) as HTMLInputElement;
  const node = (
    <form class="expression-input" role="search" onSubmit={submit}>
      {input}
    </form>
  ) as HTMLFormElement;

  const place = { ...space.place, arg: 0 };
  // What is asked so far, and the text proposed last, until it comes back.
  let asked = "";
  let echo: string | undefined;

  function readOnly() {
    input.readOnly = true;
    node.classList.add("fixed");
  }

  const said = () => (input.placeholder = asked ? continuing : beginning);

  async function propose(text: string) {
    if (text === asked) return;
    asked = text;
    echo = text;
    said();
    const change = await space.propose(place, text);
    if (!change) return readOnly();
    await space.commit(change);
  }

  function submit(event: Event) {
    event.preventDefault();
    const text = continued(asked, input.value);
    input.value = "";
    void propose(text);
  }

  // The last step of what is asked, taken back into the input.
  async function takeLast() {
    const steps = await stepsOf(asked);
    if (!steps || steps.length === 0) {
      const all = asked;
      await propose("");
      input.value = all;
      return;
    }
    const last = await printed(steps.at(-1)!);
    const rest = steps.length > 1 ? await chained(steps.slice(0, -1)) : "";
    if (last === undefined || rest === undefined) return;
    await propose(rest);
    input.value = rest ? `| ${last}` : last;
  }

  async function stepsOf(text: string): Promise<Value[] | undefined> {
    const parsed = await space.read(applying(space.glass, "parse", text));
    if (!("value" in parsed)) return;
    const steps = await space.read(applying(space.glass, "steps", parsed.value));
    return "value" in steps && Array.isArray(steps.value) ? steps.value : undefined;
  }

  async function printed(read: Value): Promise<string | undefined> {
    const answer = await space.read(applying(space.glass, "print", read));
    return "value" in answer && typeof answer.value === "string" ? answer.value : undefined;
  }

  async function chained(steps: Value[]): Promise<string | undefined> {
    const answer = await space.read(applying(space.glass, "chain", steps));
    return "value" in answer ? printed(answer.value) : undefined;
  }

  input.addEventListener("keydown", (event) => {
    if (input.readOnly) return;
    if (event.key === "Escape") input.value = "";
    if (event.key === "Backspace" && input.value === "" && asked) {
      event.preventDefault();
      void takeLast();
    }
  });

  function update([text = null]: Value[]) {
    const shown = typeof text === "string" ? text : "";
    if (shown === echo) {
      echo = undefined;
      return;
    }
    if (shown === asked) return;
    asked = shown;
    input.value = "";
    said();
  }

  update(given);
  void space.propose(place, asked).then((change) => change || readOnly(), readOnly);
  return { node, update };
};
