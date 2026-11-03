import type { HolonRead } from "../engine/engine.ts";
import { bodyProblem, type Connectors } from "../engine/types.ts";
import type { Settings } from "./component.ts";

// The settings a slot gives a component are held against those the
// component declares, as a body is held against its type: each declared,
// each of its shape, each that is not optional given. Settings that are
// not a set of values at all are said to be so.

export function settingsProblem(component: HolonRead, settings: Settings): string | undefined {
  if (typeof settings !== "object" || settings === null || Array.isArray(settings))
    return "settings that are not a set of values";
  const declared = (component.body.settings ?? {}) as unknown as Connectors;
  const problem = bodyProblem(settings, [declared]);
  return problem && `settings that do not fit: ${problem}`;
}
