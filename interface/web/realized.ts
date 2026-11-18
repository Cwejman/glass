// Where each component is realized on the web: its code, by the id of the component it
// realizes. This map is the one place that says so; a component drawn is never looked
// up by its name. Whether code stays with the chassis that runs it, or moves into the
// holons it realizes, is not yet settled, and only this file would change.
//
// Value and List are the field's own components, as glass holds them; answer is carried
// by the page's read until glass holds it.

import { answer as answerId } from "./carried.ts";
import type { Realization } from "./chassis.ts";
import { answer } from "./answer.tsx";
import { list } from "./list.tsx";
import { value } from "./value.tsx";

// The component that draws any value no other component takes.
export const fallback = "1M760BANMFZJ000";

export const realized: ReadonlyMap<string, Realization> = new Map([
  [fallback, value],
  ["1M6YD90YH1TJ00V", list],
  [answerId, answer],
]);
