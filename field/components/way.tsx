import type { Space, Target } from "../../src/interface/component.ts";
import { h, type Child } from "./jsx.ts";

// The way down to a place, from the field itself; a card that places the
// reader on what it shows; and the following of whatever inside a component
// points into the field, a link to a holon or to the field placing the
// reader there.

export interface Step {
  to: Target;
  label: string;
}

export const Way = ({ steps }: { steps: Step[] }) => (
  <nav>
    {[{ to: "field", label: "The field" }, ...steps].map(({ to, label }) => (
      <a href="#" data-to={to}>
        {label}
      </a>
    ))}
  </nav>
);

interface CardProps {
  to: Target;
  space: Space;
  class?: string;
  children?: Child;
}

export const Card = ({ to, space, class: kind, children }: CardProps) => (
  <div
    class={kind ? `card ${kind}` : "card"}
    role="link"
    tabindex="0"
    data-to={to}
    onClick={follow(space)}
    onKeydown={enterOnKey}
  >
    {children}
  </div>
);

// A press inside a component: a link to the web is followed as a link; a
// link into the field, or anything that names where it leads, places the
// reader there.
export const follow = (space: Space) => (event: Event) => {
  const pressed = event.target as Element;
  const web = pressed.closest<HTMLAnchorElement>("a[href]");
  if (web && !web.dataset.ref && !web.dataset.to) return event.stopPropagation();

  const link = pressed.closest<HTMLElement>("[data-to], a[data-ref]");
  if (!link) return;
  event.preventDefault();
  event.stopPropagation();
  void space.place((link.dataset.to ?? link.dataset.ref) as Target);
};

// Enter or Space on a card itself enters it, as a press would.
function enterOnKey(event: KeyboardEvent) {
  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  (event.currentTarget as HTMLElement).click();
}
