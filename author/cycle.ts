// Opens and closes a session's cycles, as one commit each: a cycle is a stretch of work
// that ends with everything in the field and committed, held by its session in order. The
// running one grows as each utterance is kept (append.ts); closing it says when it ended.
// Usage: bun author/cycle.ts open <session's name, or its start> <step> <purpose>
//        bun author/cycle.ts close <session's name, or its start>

import { commit } from "../integrations/glass/store.ts";
import { holonsOf, open, storeFolder } from "../stores.ts";

const [act, named, step, purpose] = process.argv.slice(2);
if (!named || (act === "open" ? !step || !purpose : act !== "close"))
  throw new Error("usage: cycle.ts open <session> <step> <purpose> | close <session>");

const store = await open(storeFolder("main"));
const holons = await holonsOf(store);
const typeNamed = (name: string) => holons.find((holon) => holon.name === name && holon.mould)!.id;

const sessions = holons.filter(
  (holon) => holon.instance[0] === typeNamed("session") && (holon.name ?? "").startsWith(named),
);
if (sessions.length !== 1) throw new Error(`${sessions.length} sessions begin with ${named}`);

const session = sessions[0]!;
const cycles = ((session.body.cycles ?? []) as { $ref: string }[]).map(
  ({ $ref }) => holons.find((holon) => holon.id === $ref)!,
);
const running = cycles.find((cycle) => cycle.body.stands === "running");
const now = new Date().toISOString();

if (act === "open") {
  if (running) throw new Error(`${running.body.step} still runs; close it first`);

  const id = store.minter()();
  session.body.cycles = [...(session.body.cycles ?? []), { $ref: id }];
  const cycle = {
    id,
    instance: [typeNamed("cycle")],
    body: { step, purpose, began: now, said: [], stands: "running" },
  };

  await commit(store, { holons: [session, cycle], says: `${session.name}: ${step} begun` });
  console.log({ opened: step, id });
} else {
  if (!running) throw new Error(`${session.name} has no cycle running`);

  running.body = { ...running.body, ended: now, stands: "closed" };
  await commit(store, { holons: [running], says: `${session.name}: ${running.body.step} closed` });
  console.log({ closed: running.body.step });
}
