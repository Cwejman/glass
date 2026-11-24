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
//
// As it is typed, what may finish the word at the caret is offered beneath it
// (complete.ts): the arrows move among the options, Tab or Enter takes one, Escape puts
// them away. Enter takes an option only once the arrows have chosen one, so a text typed
// whole is asked as it is.
//
// It is shown only while the reader is asking (asking.ts): Enter, or Escape in an empty
// input, returns the page to where it stands, as a press anywhere outside the bar does.

import { h } from "./jsx.ts";
import type { Value } from "../../engine/read/values.ts";
import { asking } from "./asking.ts";
import { q } from "../../language/shipped.ts";
import { valueOf, type Drawn, type Realization } from "../../chassis/web/chassis.ts";
import { completer, completing, taken, type Completing, type Option } from "./complete.ts";

const continuing = "| add a step, or type to ask anew";
const beginning = "An expression, as @Knowledge";

// What is asked once what is typed is added to what was asked.
export function continued(asked: string, typed: string): string {
  const next = typed.trim();
  if (!next) return asked;
  if (next.startsWith("|")) return asked ? `${asked} ${next}` : next.replace(/^\|\s*/, "");
  return next;
}

// It keeps its node, for the focus and the caret the browser keeps in it.
export const expressionInput: Realization = (given, io): Drawn => {
  const input = (
    <input
      type="text"
      autocomplete="off"
      spellcheck="false"
      aria-label="Expression"
      placeholder={beginning}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded="false"
      aria-controls="completions"
    />
  ) as HTMLInputElement;
  const offered = (<ul class="completions" id="completions" role="listbox" hidden />) as HTMLUListElement;
  const node = (
    <form class="expression-input" role="search" onSubmit={submit}>
      {input}
      {offered}
    </form>
  ) as HTMLFormElement;

  // What is asked so far, and the text proposed last, until it comes back.
  let asked = "";
  let echo: string | undefined;

  function readOnly() {
    input.readOnly = true;
    node.classList.add("fixed");
  }

  const said = () => (input.placeholder = asked ? continuing : beginning);

  // A text proposed in place of what is asked: what is asked only once it lands; where
  // there is no way back, the input is read-only, what was typed kept.
  async function propose(text: string): Promise<boolean> {
    if (text === asked) return true;
    const before = asked;
    asked = echo = text;
    if (await io.propose(text)) return (void said(), true);
    asked = before;
    echo = undefined;
    readOnly();
    return false;
  }

  async function submit(event: Event) {
    event.preventDefault();
    const text = continued(asked, input.value);
    offering++;
    offer([]);
    if (!(await propose(text))) return;
    input.value = "";
    if (text) {
      input.blur();
      asking(false, false);
    }
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
    const parsed = valueOf(await io.ask(q`parse(${text})`));
    if (parsed === undefined) return;
    const steps = valueOf(await io.ask(q`steps(${parsed})`));
    return Array.isArray(steps) ? steps : undefined;
  }

  async function printed(read: Value): Promise<string | undefined> {
    const text = valueOf(await io.ask(q`print(${read})`));
    return typeof text === "string" ? text : undefined;
  }

  async function chained(steps: Value[]): Promise<string | undefined> {
    const read = valueOf(await io.ask(q`chain(${steps})`));
    return read === undefined ? undefined : printed(read);
  }

  // What is offered now, for what is being typed, and the one the arrows chose.
  const complete = completer(io);
  let options: Option[] = [];
  let completingNow: Completing | undefined;
  let chosen = -1;
  let offering = 0;

  function offer(each: Option[], now?: Completing) {
    options = each;
    completingNow = now;
    chosen = -1;
    offered.replaceChildren(
      ...each.map((option, i) => (
        <li
          role="option"
          id={`completion-${i}`}
          aria-selected="false"
          onMousedown={(event: Event) => {
            event.preventDefault();
            take(option);
          }}
        >
          <span class="name">{option.name}</span>
          {option.takes && <span class="takes">{option.takes}</span>}
          {option.says && <span class="says">{option.says}</span>}
        </li>
      )),
    );
    offered.hidden = each.length === 0;
    input.setAttribute("aria-expanded", String(each.length > 0));
    input.removeAttribute("aria-activedescendant");
  }

  async function offerFor() {
    const mine = ++offering;
    const now = completing(input.value, input.selectionStart ?? input.value.length);
    if (!now) return offer([]);
    const each = await complete(now).catch(() => []);
    if (mine === offering) offer(each, now);
  }

  function choose(by: number) {
    if (!options.length) return;
    chosen = (chosen + by + options.length + (chosen < 0 && by < 0 ? 1 : 0)) % options.length;
    [...offered.children].forEach((each, i) => each.setAttribute("aria-selected", String(i === chosen)));
    input.setAttribute("aria-activedescendant", `completion-${chosen}`);
    offered.children[chosen]?.scrollIntoView?.({ block: "nearest" });
  }

  function take(option: Option) {
    if (!completingNow) return;
    const { text, caret } = taken(
      input.value,
      input.selectionStart ?? input.value.length,
      completingNow,
      option,
    );
    input.value = text;
    input.setSelectionRange(caret, caret);
    offering++;
    offer([]);
  }

  input.addEventListener("input", () => void offerFor());
  input.addEventListener("blur", () => {
    offering++;
    offer([]);
  });

  input.addEventListener("keydown", (event) => {
    if (input.readOnly) return;
    if (options.length) {
      const taking = event.key === "Tab" || (event.key === "Enter" && chosen >= 0);
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        return choose(event.key === "ArrowDown" ? 1 : -1);
      }
      if (taking) {
        event.preventDefault();
        return take(options[Math.max(chosen, 0)]!);
      }
      if (event.key === "Escape") {
        offering++;
        return offer([]);
      }
    }
    if (event.key === "Escape") {
      if (!input.value) {
        input.blur();
        return asking(false, false);
      }
      input.value = "";
    }
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
  return { node, update };
};
