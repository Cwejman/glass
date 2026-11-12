// Who listens to the field: a subscription is a read answered again whenever what it
// read may have changed, and told only when its answer is different; one who listens to
// the field itself is told of every change.

import { canonical } from "../integrations/glass/canonical.ts";
import type { Expression, Value } from "../language/expression.ts";
import type { Field } from "./field.ts";
import { answer, type Touched } from "./read/answer.ts";

export type Listener = (answer: { value: Value } | { error: string }) => void;

// What a change touched: the holons an act wrote or took out, or the whole field.
export type Changed = readonly string[] | "everything";

type Subscription = {
  expression: Expression;
  listener: Listener;
  last?: string;
  touched?: Touched;
  asked: number;
};

export function listening(current: () => Field) {
  const subscriptions = new Set<Subscription>();
  const listeners = new Set<() => void>();
  let changes = 0;

  // A subscription answered: told only when the answer is new, and never with an answer
  // a later change has already overtaken.
  async function ask(subscription: Subscription) {
    const asked = (subscription.asked = ++changes);
    const told = await answer(current(), subscription.expression).then(
      ({ value, touched }) => ({ said: canonical(value), tell: { value }, touched }),
      (error: unknown) => ({
        said: "",
        tell: { error: error instanceof Error ? error.message : String(error) },
        touched: undefined,
      }),
    );

    if (subscription.asked !== asked || !subscriptions.has(subscription)) return;
    subscription.touched = told.touched;
    if (told.said && told.said === subscription.last) return;

    subscription.last = told.said;
    subscription.listener(told.tell);
  }

  const reaches = (touched: Touched | undefined, changed: Changed) =>
    !touched ||
    touched === "everything" ||
    changed === "everything" ||
    touched.holons.some((id) => changed.includes(id));

  return {
    add(expression: Expression, listener: Listener) {
      const subscription: Subscription = { expression, listener, asked: 0 };
      subscriptions.add(subscription);
      void ask(subscription);
      return () => subscriptions.delete(subscription);
    },

    onChange(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    changed(changed: Changed) {
      for (const listener of listeners) listener();
      for (const subscription of subscriptions)
        if (reaches(subscription.touched, changed)) void ask(subscription);
    },
  };
}
