// The engine governs: it is the one way into the field, and is itself governed by what
// the field declares. It keeps no store of its own. It mounts stores so that work can
// be done, and does these few things:
//
//   attach     mount a store, through an integration, to be read or also written; an
//              act some writer cut short in it is settled then
//   detach     let a store go
//   read       work an expression out over the field
//   judge      weigh a change against the field, writing nothing
//   commit     judge a change and write it, one act in every store it touches
//   subscribe  read, and read again whenever what was read may have changed
//   onChange   hear that the field changed, whatever changed
//   moved      take a store another moved as it now stands
//
// What changes the field, attaching, detaching, committing, a store moved by another,
// is done one at a time, each making the next field from the one before. Reading and
// judging ask the field as it stands.
//
// Read in this order: field.ts, the field as a value; world.ts, the field read whole as
// an expression works over it; reading.ts, a read answered by identity or over the
// world, by core/, the bare language and its natives, and patterns/, facts, the index
// and the planner; act.ts and judge.ts, a change planned and judged, purely; writing.ts,
// the one effect; listening.ts, who is told.
//
// Whoever is given an engine is given these verbs alone: the interface, the command line,
// and in time a program. Who asks is not yet said with a read or a change; where what one
// may read or change is to be governed, it enters there, into evaluation and judging, for
// no wrapper can narrow what an expression reaches.

import type { Holon } from "../integrations/glass/store.ts";
import type { Source } from "../integrations/source.ts";
import type { Expression, Value } from "../language/expression.ts";
import type { Change, Problem } from "./act.ts";
import { attached, detached, fieldOf, withStores, type Attachment, type Field } from "./field.ts";
import { listening, type Changed, type Listener } from "./listening.ts";
import { answer } from "./reading.ts";
import { planIn, refusal, settled, write, type Committed } from "./writing.ts";

export type { Attachment, Change, Committed, Listener, Problem };

export type Engine = {
  attach(attachment: Attachment): Promise<void>;
  detach(key: string): Promise<void>;
  read(expression: Expression): Promise<Value>;
  judge(change: Change): Promise<Problem[]>;
  commit(change: Change): Promise<Committed>;
  subscribe(expression: Expression, listener: Listener): () => void;
  // Told whenever the field changes, whatever changed.
  onChange(listener: () => void): () => void;
  // A store moved by another, taken as it now stands: told by whoever watches it.
  moved(key: string, store: Source): Promise<void>;
};

// The engine, and the field it stands at, for what translates the forms of read before
// expressions; nothing else asks for the field.
export function engine(attachments: readonly Attachment[] = []): Engine & { field(): Field } {
  let field = fieldOf(attachments);
  const inTurn = turns();
  const listeners = listening(() => field);

  function become(next: Field, changed: Changed = "everything") {
    if (next === field) return;
    field = next;
    listeners.changed(changed);
  }

  return {
    attach: (attachment) =>
      inTurn(async () => {
        become(attached(field, attachment));
        if (attachment.write) become((await settled(field)).field);
      }),

    detach: (key) => inTurn(async () => become(detached(field, key))),

    read: async (expression) => (await answer(field, expression)).value,

    judge: async (change) => (await planIn(field, change)).problems,

    commit: (change) =>
      inTurn(async () => {
        const { field: now, waiting } = await settled(field);
        become(now);

        const plan = await planIn(field, change);
        const held = plan.stores.find(({ key }) => waiting.has(key));
        if (held) throw new Error(`${held.key} refuses writes: ${waiting.get(held.key)}`);

        if (plan.problems.length) throw refusal(plan.problems, change);

        const written = await write(field, plan, change);
        become(written.field, touchedBy(plan.stores, change));
        if ("failed" in written) throw written.failed;

        return written.committed;
      }),

    subscribe: (expression, listener) => listeners.add(expression, listener),

    onChange: (listener) => listeners.onChange(listener),

    field: () => field,

    moved: (key, store) =>
      inTurn(async () => {
        const attachment = field.stores.find((one) => one.key === key);
        if (!attachment) throw new Error(`nothing is attached as ${key}`);
        if (attachment.write) throw new Error(`${key} is written here, and is never taken again`);

        become(withStores(field, new Map([[key, store]])));
      }),
  };
}

// What an act touched: every holon it wrote, and every one it took out.
const touchedBy = (
  stores: readonly { holons: readonly Holon[]; gone?: readonly string[] }[],
  change: Change,
) => [...stores.flatMap(({ holons }) => holons.map(({ id }) => id)), ...(change.gone ?? [])];

// One task at a time, each after the one before has ended, however it ended.
function turns() {
  let last: Promise<unknown> = Promise.resolve();

  return <T>(task: () => Promise<T>) => {
    const taken = last.then(task);
    last = taken.catch(() => undefined);
    return taken;
  };
}
