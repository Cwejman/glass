// The natives, by family: what the bare language does in code, each a small pure act.
// Every one beyond the barest says why it is native: laziness, hashing, or speed.
// Those under legacy are kept only while functions written in the field still call
// them, and go as those are written again upon the rest.

import type { Expression, Value } from "../../../../language/expression.ts";
import type { Field } from "../field.ts";
import type { Scope } from "../evaluate.ts";
import { patterns } from "./find.ts";
import { history } from "./history.ts";
import { holons } from "./holons.ts";
import { lazy } from "./lazy.ts";
import { legacy } from "./legacy.ts";
import { lists } from "./lists.ts";
import { sets } from "./sets.ts";
import { values } from "./values.ts";

export type Native = (given: Value[]) => Value | Promise<Value>;

// What a lazy native is given: each of what it is given, to be worked out if needed, and
// a record's one field alone, for a case.
export type Deferred = (() => Promise<Value>) & { key: (key: string) => Promise<Value | undefined> };
export type Lazy = (given: Deferred[]) => Promise<Value>;

export type Structural = (given: Expression[], scope: Scope) => Promise<Value>;

// What a native may ask of the evaluator calling it.
export type Calling = {
  field: Field;
  apply(fn: unknown, given: Value[]): Promise<Value>;
  evaluate(expression: Expression, scope: Scope): Promise<Value>;
  // The native a call names, if it names one: how a pattern reads its clauses.
  nativeOf(expression: unknown): Promise<string | undefined>;
};

export function natives(calling: Calling) {
  return {
    given: {
      ...values,
      ...lists(calling),
      ...holons(calling),
      ...history(calling),
      ...legacy(calling),
      // A word said is a clause of a pattern, and nothing outside one.
      said: () => {
        throw new Error("said(e, a, w) is a clause of a pattern, asked within find");
      },
    } as Record<string, Native>,
    lazy: { ...lazy, ...sets() } as Record<string, Lazy>,
    structural: patterns(calling) as Record<string, Structural>,
  };
}
