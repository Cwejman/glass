import type { Id } from "../../src/store/id.ts";
import { h } from "./jsx.ts";

// The way down to a place, from the top of its holarchy: each step a link
// that says where it leads, as every location does, and does nothing of its
// own. A press on it rises to whatever holds it and cares.

export interface Step {
  to: Id;
  label: string;
}

export const Way = ({ steps }: { steps: Step[] }) => (
  <nav>
    {steps.map(({ to, label }) => (
      <a href="#" data-location={JSON.stringify([to])}>
        {label}
      </a>
    ))}
  </nav>
);
