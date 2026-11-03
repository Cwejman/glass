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
    tabindex="0"
    data-to={to}
    onClick={follow(space)}
    onKeydown={(event: KeyboardEvent) =>
      event.key === "Enter" && (event.currentTarget as HTMLElement).click()
    }
  >
    {children}
  </div>
);

export const follow = (space: Space) => (event: Event) => {
  const link = (event.target as Element).closest<HTMLElement>("[data-to], a[data-ref]");
  if (!link) return;
  event.preventDefault();
  event.stopPropagation();
  void space.place((link.dataset.to ?? link.dataset.ref) as Target);
};
