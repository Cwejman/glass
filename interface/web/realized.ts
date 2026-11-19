// Where each component is realized on the web: its code, by the name of the component
// glass ships. This is the one place that says so; the page finds each component's id
// once, by its route (carried.ts), and a component drawn is found here by that id, never
// by its name. A chassis on another surface keeps a map of its own.

import type { Glass } from "./carried.ts";
import type { Realization } from "./chassis.ts";
import { answer } from "./answer.tsx";
import { expressionInput } from "./expression-input.tsx";
import { list } from "./list.tsx";
import { pill } from "./pill.tsx";
import { value } from "./value.tsx";

const realizations = {
  Value: value,
  List: list,
  Answer: answer,
  ExpressionInput: expressionInput,
  Pill: pill,
} satisfies Partial<Record<keyof Glass, Realization>>;

// The components realized here, by the ids glass ships them under.
export const realizedIn = (glass: Glass): ReadonlyMap<string, Realization> =>
  new Map(
    Object.entries(realizations).map(([name, realization]) => [
      glass[name as keyof typeof realizations],
      realization,
    ]),
  );
