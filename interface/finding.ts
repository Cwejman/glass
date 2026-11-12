// How a component is found for a slot. This is the one place that says, so how it
// is found can change here alone: whether the field should record the pick instead
// is not settled.

import type { HolonRead } from "../engine/compat.ts";
import type { Kind, Reading } from "./component.ts";

const argumentOf = (component: HolonRead) => (component.body.argument as string | undefined) ?? "holon";
const takesOf = (component: HolonRead) => component.body.takes as string[];
const drawsIn = (component: HolonRead, kind: Kind) => (component.body.kinds as string[]).includes(kind);

// Given that kind of thing, in that kind of slot. A way of looking reads as the list
// it gathers, so what draws a list draws it too; one that gives no set gives a value,
// drawn only by what takes a value, or the selection.
function able(component: HolonRead, reads: Reading, kind: Kind, value = false) {
  const given = value ? "value" : "holon" in reads ? "holon" : "list" in reads ? "list" : "expression";
  const argument = argumentOf(component);

  return (
    drawsIn(component, kind) &&
    (argument === given || argument === "selection" || (given === "expression" && argument === "list"))
  );
}

// Those that can draw a slot: for a holon, those that take one of its types, and the
// wildcard, which takes nothing in particular; for a list, every able one.
export function candidates(
  components: readonly HolonRead[],
  reads: Reading,
  holon: HolonRead | null,
  kind: Kind,
  value = false,
) {
  const fitting = components.filter((component) => able(component, reads, kind, value));

  if (!("holon" in reads)) return fitting;

  return fitting.filter((component) => {
    const takes = takesOf(component);
    return takes.length === 0 || takes.some((type) => holon?.types.includes(type));
  });
}

// A component drawn only where a slot names it, as a widget is, is never found for one:
// it may still be chosen, as among the candidates the menu offers.
const foundable = (component: HolonRead) => component.body.named !== true;

// The one found: for a holon, one that takes its type before the wildcard. For a way
// of looking, one given ways of looking, else a list that takes nothing in particular.
export function match(
  components: readonly HolonRead[],
  reads: Reading,
  holon: HolonRead | null,
  kind: Kind,
  value = false,
) {
  const fitting = candidates(components, reads, holon, kind, value).filter(foundable);

  if (value) return fitting.find((component) => argumentOf(component) === "value");
  const particular = (component: HolonRead) => takesOf(component).length > 0;

  if ("gather" in reads) {
    return (
      fitting.find((component) => argumentOf(component) === "expression") ??
      fitting.find((component) => argumentOf(component) === "list" && !particular(component))
    );
  }

  if ("list" in reads) {
    const general = fitting.filter((component) => !particular(component));
    return general.find((component) => argumentOf(component) === "list") ?? general[0];
  }

  return (
    fitting.find(particular) ?? fitting.find((component) => argumentOf(component) === "holon") ?? fitting[0]
  );
}
