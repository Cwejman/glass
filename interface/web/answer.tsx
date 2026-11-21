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
import { trailOf, wholesOf } from "./trail.tsx";

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
  // Once what is answered next changes, or it has been long enough.
  let changed: Promise<void> = Promise.resolve();

  const unsubscribe = () => {
    turn++;
    stop?.();
    stop = undefined;
  };

  // The trail to the holon given, or none: drawn once it is known and what it leads to
  // is shown, what was there kept until then.
  function trace(value: Value, mine: number): Promise<void> | undefined {
    const id = isRef(value) ? value.$ref : undefined;
    if (id === traced) return;
    traced = id;
    const showing = changed;
    if (!id) return void showing.then(() => mine === turn && traced === id && arrange(trail, []));
    return wholesOf(space.read, space.glass, id)
      .catch(() => [])
      .then(async (steps) => {
        // The trail moves with what it leads to, never before it.
        const made = steps.length > 1 ? [trailOf(steps)] : [];
        await showing;
        if (mine === turn && traced === id) arrange(trail, made);
      });
  }

  function subscribing(read: Read, start = false) {
    const mine = turn;
    const header = start ? startOf() : undefined;
    settle();
    settle = awaiting(node);
    changed = new Promise((done) => {
      const observer = new MutationObserver(() => finish());
      const timer = setTimeout(() => finish(), 2000);
      const finish = () => {
        observer.disconnect();
        clearTimeout(timer);
        done();
      };
      observer.observe(answered, { childList: true, subtree: true, characterData: true });
    });

    let first = true;
    void space
      .subscribe(read, (answer: Answer) => {
        if (mine !== turn) return;
        settle();
        void trace(start || !("value" in answer) ? null : answer.value, mine);
        space.redraw(() =>
          arrange(answered, [
            ...(header ? [header] : []),
            "value" in answer ? space.draw(answer.value) : note(answer.problem),
          ]),
        );
        // Moved to another answer, it is read from its top, once it shows.
        if (first && drawnOnce) void changed.then(() => mine === turn && scrollY > 0 && scrollTo({ top: 0 }));
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
      One field, kept in the stores below. Open one, or type an expression above, as <code>@Knowledge</code>.
    </p>
  </header>
);
