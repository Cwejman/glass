// A read, drawn as what it gives, again whenever that changes; and, where it gives a
// holon, where that holon stands: the wholes holding it, each a step back (trail.tsx).
// Given another read, it lets go of the first and keeps the second, what the first gave
// shown until the second answers. Given nothing, the read of a blank text, it draws the
// start: the field's roots, each store by its root.
//
// An answer slow to come is said by the event busy, bubbling from it, true while it is
// awaited and false once it lands, so the page may show it is working.

import { h } from "./jsx.ts";
import type { Answer, Read } from "../../engine/engine.ts";
import { isRecord, isRef, type Value } from "../../engine/read/values.ts";
import { applying } from "./carried.ts";
import { arrange, awaiting, note, type Realization } from "./chassis.ts";
import { homeTrail, saidTrail, trailOf, wholesOf } from "./trail.tsx";

export const answer: Realization = (given, space) => {
  const trail = (<div class="trail-at" />) as HTMLElement;
  const answered = (<div class="answered" />) as HTMLElement;
  const node = (<div class="answer">{[trail, answered]}</div>) as HTMLElement;
  let asked: string | undefined;
  let stop: (() => void) | undefined;
  let turn = 0;
  let traced: string | undefined;
  let drawnOnce = false;
  let settle = () => {};
  // What is done once what is answered next shows, or it has been long enough: all of it
  // in that one moment, before the page is painted, so nothing moves ahead of the rest.
  let whenShown = (act: () => void) => act();

  const unsubscribe = () => {
    turn++;
    stop?.();
    stop = undefined;
  };

  // Where the answer stands: the trail to the holon given, or else what was asked, as the
  // address says it, or home at the start. Drawn once it is known and what it leads to
  // is shown, what was there kept until then.
  function trace(value: Value, mine: number, start: boolean): Promise<void> | undefined {
    const id = isRef(value) ? value.$ref : undefined;
    const text = start ? "" : (new URLSearchParams(location.search).get("q") ?? "");
    const key = id ?? `said ${text}`;
    if (key === traced) return;
    traced = key;
    const showing = whenShown;
    if (!id)
      return void showing(
        () => mine === turn && traced === key && arrange(trail, [text ? saidTrail(text) : homeTrail()]),
      );
    return wholesOf(space.read, space.glass, id)
      .catch(() => [])
      .then((steps) => {
        // The trail moves with what it leads to, never before it.
        const made = steps.length > 0 ? [trailOf(steps)] : [];
        showing(() => mine === turn && traced === key && arrange(trail, made));
      });
  }

  function subscribing(read: Read, start = false) {
    const mine = turn;
    const header = start ? startOf() : undefined;
    settle();
    settle = awaiting(node);
    // What is shown has changed once something in it changed and nothing drawn within it
    // still waits to say what it shows (data-waiting, as a holon being read).
    const acts: (() => void)[] = [];
    let shown = false;
    const finish = () => {
      if (shown) return;
      shown = true;
      observer.disconnect();
      clearTimeout(timer);
      for (const act of acts.splice(0)) act();
    };
    const observer = new MutationObserver(() => {
      if (!answered.querySelector("[data-waiting]")) finish();
    });
    const timer = setTimeout(finish, 2000);
    observer.observe(answered, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-waiting"],
    });
    whenShown = (act) => (shown ? act() : void acts.push(act));

    let first = true;
    void space
      .subscribe(read, (answer: Answer) => {
        if (mine !== turn) return;
        settle();
        void trace(start || !("value" in answer) ? null : answer.value, mine, start);
        // The start's header, leaving, stays until what follows it shows, as the trail waits.
        const leaving = header ? null : answered.querySelector(":scope > header.start");
        space.redraw(() =>
          arrange(answered, [
            ...(header ? [header] : leaving ? [leaving] : []),
            "value" in answer ? space.draw(answer.value) : note(answer.problem),
          ]),
        );
        if (leaving) whenShown(() => mine === turn && leaving.remove());
        // Moved to another answer, it is read from its top, once it shows: the answer itself
        // where it scrolls on its own, as the page lays it out, else the page.
        if (first && drawnOnce)
          whenShown(() => {
            if (mine !== turn) return;
            if (answered.scrollTop > 0) answered.scrollTo({ top: 0 });
            if (scrollY > 0) scrollTo({ top: 0 });
          });
        first = false;
        drawnOnce = true;
      })
      .then((stopping) => (mine === turn ? (stop = stopping) : stopping()));
  }

  function update([read = null]: Value[]) {
    const key = JSON.stringify(read);
    if (key === asked) return;
    asked = key;
    unsubscribe();

    if (read === null) {
      const mine = turn;
      const roots = `find(?root, [?root, "instance", @${space.glass.store}])`;
      void space.read(applying(space.glass, "parse", roots)).then((parsed) => {
        if (mine !== turn) return;
        if ("value" in parsed) subscribing(parsed.value as unknown as Read, true);
        else space.redraw(() => arrange(answered, [startOf()]));
      });
      return;
    }
    if (!isRecord(read) || !("gives" in read)) {
      settle();
      return space.redraw(() => arrange(answered, [note("What answer is given is no read to draw.")]));
    }
    subscribing(read as unknown as Read);
  }

  update(given);
  return {
    node,
    update,
    dispose() {
      unsubscribe();
      settle();
    },
  };
};

// What the start says above the field's roots.
const startOf = () => (
  <header class="start">
    <h1>Glass</h1>
    <p class="lede">
      One field, kept in the stores below. Open one, or press λ above to type an expression, as{" "}
      <code>@Knowledge</code>.
    </p>
  </header>
);
