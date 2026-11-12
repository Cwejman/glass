// What the search builds, apart from how it is drawn: a function being given what it
// takes, one argument after another, and the part of an expression that comes of it.
// These are pure, so what a press would lead to can be known without a page.

import type { Argument, Looking as Expression } from "../engine/compat.ts";
import { canonical } from "../integrations/glass/canonical.ts";
import { call, holonsOf, native, type Called, type Functions } from "./parts.ts";

// A function being given what it takes.
export type Frame = { fn: Called; given: Argument[] };

export const same = (a: Argument, b: Argument) => canonical(a) === canonical(b);

const complete = ({ fn, given }: Frame) => given.length >= fn.takes.length && fn.takes.at(-1) !== "sets";

// The kind of argument the function being built takes next.
export function needs(frames: Frame[]) {
  const frame = frames.at(-1);
  if (!frame) return undefined;

  const { takes } = frame.fn;
  return takes[Math.min(frame.given.length, takes.length - 1)];
}

// Whether enough sets are given to a function of any number of them.
export function hasEnough({ fn, given }: Frame) {
  return fn.takes.at(-1) === "sets" && given.length >= fn.takes.length;
}

// What is built once a value is given: the frames as they would stand, and, where
// every function taken has all it takes, the part made. Nothing given closes the
// function built last, as Done does.
export function settled(
  value: Argument | undefined,
  frames: Frame[],
): { frames: Frame[]; part?: Expression } {
  if (!frames.length) return { frames, ...(value ? { part: value as Expression } : {}) };

  const next = frames.map((frame) => ({ ...frame, given: [...frame.given] }));
  let giving = value;

  for (;;) {
    const top = next.at(-1)!;

    if (giving !== undefined) {
      top.given.push(giving);
      if (!complete(top)) return { frames: next };
    }

    next.pop();

    const made = call(top.fn, ...top.given);
    if (!next.length) return { frames: next, part: made };

    giving = made;
  }
}

// A part changed to another: the same function given one holon more, or one fewer,
// where both are given holons; let go when none is left; else the other part instead.
export function changedPart(functions: Functions, was: Expression, part: Expression): Expression[] {
  const before = "call" in was && "call" in part && was.call.$ref === part.call.$ref ? (was.with ?? []) : [];
  const had = before.length === 1 ? holonsOf(functions, before[0]) : undefined;
  const now = "call" in part && part.with?.length === 1 ? holonsOf(functions, part.with[0]) : undefined;

  if (!had || now?.length !== 1) return [part];

  const kept = had.some((each) => same(each, now[0]!))
    ? had.filter((each) => !same(each, now[0]!))
    : [...had, now[0]!];

  if (kept.length === 0) return [];

  const fn = functions.get((part as { call: { $ref: string } }).call.$ref)!;

  return [call(fn, kept.length === 1 ? kept[0]! : call(native(functions, "or"), ...kept))];
}

// Whether what is typed is said by a label, in any order, whatever the case.
export const fits = (text: string, label: string) =>
  text
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((word) => label.toLocaleLowerCase().includes(word));

// Whether a label begins with what is typed, so it is found first.
export const begins = (text: string, label: string) =>
  label.toLocaleLowerCase().startsWith(text.trim().toLocaleLowerCase());
