import type { HolonRead } from "../engine/engine.ts";
import { bodyProblem, type Connectors } from "../engine/types.ts";
import type { Settings } from "./component.ts";

// The settings a slot gives a component are held against those the
// component declares, as a body is held against its type: each declared,
// each of its shape, each that is not optional given.

export function settingsProblem(component: HolonRead, settings: Settings): string | undefined {
  const declared = (component.body.settings ?? {}) as unknown as Connectors;
  const problem = bodyProblem(settings, [declared]);
  return problem && `settings that do not fit: ${problem}`;
}
