// The natives, by family: what the bare language does in code, each a small pure act.
// Every one beyond the barest says why it is native: laziness, hashing, or speed.
// Those under legacy are kept only while functions written in the field still call
// them, and go as those are written again upon the rest.

import type { Value } from "../values.ts";
import type { Field } from "../field.ts";
import type { Maybe } from "../maybe.ts";
import { back } from "../back.ts";
import { patterns } from "./find.ts";
import { history } from "./history.ts";
import { holons } from "./holons.ts";
import { lazy } from "./lazy.ts";
import { legacy } from "./legacy.ts";
import { lists } from "./lists.ts";
import { sets } from "./sets.ts";
import { steps } from "./steps.ts";
import { text } from "./text.ts";
import { values } from "./values.ts";

export type Native = (given: Value[]) => Maybe<Value>;

// What a lazy native is given: each of what it is given, to be worked out if needed, and
// a record's one field alone, for a case.
export type Deferred = (() => Maybe<Value>) & { key: (key: string) => Maybe<Value> | undefined };
export type Lazy = (given: Deferred[]) => Maybe<Value>;

// What a native that reads what it is given as written is given: each as written, and
// how to read it where it was written.
export type Structural = (given: unknown[], written: Written) => Maybe<Value>;

// How what is given is read as written: what one gives; whether it is written as a fact
// of three, a record, or a call, with the native it names and what it gives it; and a
// test, held to the values of the pattern's variables it reads.
export type Written = {
  value(given: unknown): Maybe<Value>;
  fact(given: unknown): unknown[] | undefined;
  fields(given: unknown): Record<string, unknown> | undefined;
  called(given: unknown): Maybe<{ native?: string; given: unknown[] } | undefined>;
  test(given: unknown): Maybe<{ names: string[]; holds: (values: Value[]) => Maybe<Value> } | undefined>;
};

// What a native may ask of the evaluator calling it.
export type Calling = {
  field: Field;
  apply(fn: unknown, given: Value[]): Maybe<Value>;
};

export function natives(calling: Calling) {
  return {
    given: {
      ...values,
      ...lists(calling),
      ...holons(calling),
      ...history(calling),
      ...legacy(calling),
      ...text(calling),
      ...steps,
      ...back(calling),
      // A word said is a clause of a pattern, and nothing outside one.
      said: () => {
        throw new Error("said(e, a, w) is a clause of a pattern, asked within find");
      },
    } as Record<string, Native>,
    lazy: { ...lazy, ...sets() } as Record<string, Lazy>,
    structural: {
      ...patterns(calling),
      // A value as it is written, nothing in it worked out: for a value given to a read
      // as data, as a drawing or a read is, whose references are its own.
      quote: ([written]) => (written ?? null) as Value,
    } as Record<string, Structural>,
  };
}
