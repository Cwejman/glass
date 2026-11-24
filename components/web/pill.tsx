// A step of a read, said as text by print, with a × that takes it out of the read: its
// removal is proposed where the pill stands, among the steps drawn beside it; where the
// way back finds no change, the chassis marks the place fixed and the × is put away.
//
// The × submits the form the pill is, so whoever keeps the address takes it as a step.

import { h } from "./jsx.ts";
import { q } from "../../language/shipped.ts";
import type { Realization } from "../../chassis/web/chassis.ts";

export const pill: Realization = ([step = null], io) => {
  const said = io.read(q`print(${step})`);
  const remove = (event: Event) => {
    event.preventDefault();
    void io.remove();
  };
  return (
    <form class="pill" onSubmit={remove}>
      <code class="said">{typeof said === "string" ? said : ""}</code>
      <button type="submit" aria-label="Take this step out">
        ×
      </button>
    </form>
  );
};
