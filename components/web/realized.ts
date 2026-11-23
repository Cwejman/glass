// The components realized on the web: each one's code, by the id glass ships the
// component under, found once by its route; and what else the components name of glass,
// the direction a list runs in. This is the one place that says which code realizes which
// component; the chassis is given the map and finds a drawing's realization by its
// component's id, never by its name. A package of components for another surface keeps a
// map of its own.

import type { Realization } from "../../chassis/web/chassis.ts";
import { found, type Found } from "../../language/shipped.ts";
import type { Engine } from "../../engine/engine.ts";
import { answer } from "./answer.tsx";
import { brief } from "./brief.tsx";
import { choose } from "./choose.tsx";
import { expressionInput } from "./expression-input.tsx";
import { list } from "./list.tsx";
import { pill } from "./pill.tsx";
import { value } from "./value.tsx";

// What the components name of glass, by route from glass's level.
export const components = {
  Value: "components/Value",
  List: "components/List",
  Answer: "components/Answer",
  ExpressionInput: "components/ExpressionInput",
  Pill: "components/Pill",
  Choose: "components/Choose",
  Brief: "components/Brief",
  Search: "components/Search",
  Reader: "components/Reader",
  row: "interface/row",
};

export type Components = Found<typeof components>;

// The code of each component realized here, given what the components found.
const realizations = (own: Components) => ({
  Value: value,
  List: list(own.row),
  Answer: answer,
  ExpressionInput: expressionInput,
  Pill: pill,
  Choose: choose,
  Brief: brief,
});

// The components realized here, by their ids.
export const realizedIn = (own: Components): ReadonlyMap<string, Realization> =>
  new Map(
    Object.entries(realizations(own)).map(([name, realization]) => [
      own[name as keyof Components],
      realization,
    ]),
  );

// Each component by its id, the name glass ships it under, as the chassis and inspector say it.
export const namesOf = (own: Components): ReadonlyMap<string, string> =>
  new Map(Object.entries(own).map(([name, id]) => [id, name]));

// The components on the web as the chassis is given them, found in glass: their code by
// id, what each is called, the one that chooses where several could draw a value, and the
// one drawing what none takes by a type of the field.
export async function webComponents(read: Engine["read"]) {
  const own = await found(read, components);
  return { realized: realizedIn(own), names: namesOf(own), choose: own.Choose, fallback: own.Value };
}
