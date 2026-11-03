import type { Space, Target } from "../../src/interface/component.ts";
import { element } from "./element.ts";

// The way down to a place, from the field itself, and the following of
// whatever inside a component points into the field: a link with a holon's
// id, or with the field, places the reader there.

export interface Step {
  to: Target;
  label: string;
}

export function way(steps: Step[]) {
  const nav = element("nav");
  for (const step of [{ to: "field" as const, label: "The field" }, ...steps]) {
    const link = element("a", undefined, step.label);
    link.href = "#";
    link.dataset.to = step.to;
    nav.append(link);
  }
  return nav;
}

export function follow(root: HTMLElement, space: Space) {
  root.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLElement>("[data-to], a[data-ref]");
    if (!link) return;
    event.preventDefault();
    event.stopPropagation();
    void space.place((link.dataset.to ?? link.dataset.ref) as Target);
  });
}

// A card that places the reader on what it shows when pressed.
export function card(to: Target) {
  const made = element("div", "card");
  made.tabIndex = 0;
  made.dataset.to = to;
  made.addEventListener("keydown", (event) => {
    if (event.key === "Enter") made.click();
  });
  return made;
}
