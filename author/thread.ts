// Raises threads and moves where they stand, as one commit. A thread is a question held
// open in the field: what it asks, where it stands, and the sentences it was raised in,
// so a change in certainty is a commit that since() finds.
// Usage: bun author/thread.ts <threads.json>
//
// A list of what to do, each one of:
//   { "name": "...", "asks": "...", "stands": "open",
//     "raised": { "session": "its name, or its start", "order": 9, "words": "a phrase it says" },
//     "touches": ["a brief's id"], "awaits": true }    awaits: it waits on the author                      a thread raised; words narrow it to
//                                                         the sentences that say them
//   { "move": "its name", "stands": "leaning", "asks": "..." }   where one stands, said again
//   { "says": "..." }                                     what the commit says of itself

import { handles } from "../engine/uses/migrate.ts";
import { authorsField, commitOf, type Holon } from "./field.ts";
import { typeNamed } from "../stores.ts";
import { lifted, markedOf, proseWriter, sentencesOf, type Run } from "./prose.ts";

type Raise = {
  name: string;
  asks: string;
  stands: string;
  raised: { session: string; order: number; words?: string };
  touches?: string[];
  awaits?: boolean;
};
type Move = { move: string; stands: string; asks?: string; awaits?: boolean };
type Step = Raise | Move | { says: string };

const ref = (id: string) => ({ $ref: id });
const refsOf = (list: unknown) =>
  (Array.isArray(list) ? list : []).flatMap((each) =>
    typeof each?.$ref === "string" ? [each.$ref as string] : [],
  );

const steps: Step[] = await Bun.file(process.argv[2]!).json();
const { holons, types: fieldTypes } = await authorsField();
const byId = new Map(holons.map((holon) => [holon.id, holon]));
const handle = handles();

const types = fieldTypes;
const threadType = typeNamed(types, "thread");
const threads = holons.find((holon) => holon.instance[0] === typeNamed(types, "threads"))!;
const threadNamed = (name: string) =>
  holons.find((holon) => holon.instance[0] === threadType && holon.name === name);

// The prose a thread is raised in: a sentence it names is lifted out of its paragraph,
// held there in its place, where it is not lifted already.
const writer = proseWriter(holons, handle, fieldTypes);
const holonOf = (id: string) => byId.get(id) ?? writer.born.find((holon) => holon.id === id);
const typeOf = (id: string) => byId.get(holonOf(id)?.instance[0] ?? "")?.name;
// Marked text as it reads, its marks and escapes let go, so a phrase is found in it.
const plain = (marked: string) =>
  marked
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\\(.)/g, "$1")
    .replace(/[*`]/g, "");
const textOf = (id: string) => plain(markedOf(holonOf(id)?.body.text, holonOf, typeOf));
const liftedIn = new Map<string, Holon>();

// The sentences an utterance said, those that say the words given where words are given,
// each lifted out of its paragraph.
function raisedIn({ session, order, words }: Raise["raised"]) {
  const kept = holons.find((holon) => holon.name?.startsWith(session) && holon.body.said);
  if (!kept) throw new Error(`no session named ${session}`);

  const utterance = refsOf(kept.body.said)
    .map((id) => byId.get(id)!)
    .find((one) => one.body.order === order);
  if (!utterance) throw new Error(`${kept.name} has no utterance ${order}`);

  const raised: string[] = [];
  for (const id of refsOf(utterance.body.flow)) {
    if (typeOf(id) !== "paragraph") continue;
    const paragraph = liftedIn.get(id) ?? byId.get(id)!;
    let runs = paragraph.body.text as Run[];

    for (let i = 0; i < sentencesOf(runs, textOf).length; i++) {
      const span = sentencesOf(runs, textOf)[i]!;
      if (words && !plain(span.text).includes(words)) continue;

      const [fromRun, fromAt] = span.from;
      const [toRun, toAt] = span.to;
      const only = runs[fromRun];
      if (
        fromRun === toRun &&
        fromAt === 0 &&
        toAt === 1 &&
        typeof only !== "string" &&
        typeOf(only!.$ref) === "sentence"
      ) {
        raised.push(only!.$ref);
        continue;
      }
      runs = lifted(runs, span, (inner) => {
        const sentence = writer.put("sentence", { text: inner });
        raised.push(sentence);
        return sentence;
      });
    }
    if (runs !== paragraph.body.text)
      liftedIn.set(id, { ...paragraph, body: { ...paragraph.body, text: runs } });
  }
  if (!raised.length) throw new Error(`utterance ${order} of ${kept.name} never says “${words}”`);

  return raised;
}

const born: Holon[] = [];
const moved: Holon[] = [];

for (const step of steps) {
  if ("says" in step) continue;

  if ("move" in step) {
    const was = threadNamed(step.move);
    if (!was) throw new Error(`no thread named ${step.move}`);

    const body: Holon["body"] = {
      ...was.body,
      stands: step.stands,
      ...(step.asks ? { asks: step.asks } : {}),
    };
    if (step.awaits !== undefined) body.awaits = step.awaits;

    moved.push({ ...was, body });
    continue;
  }

  if (threadNamed(step.name)) throw new Error(`a thread is already named ${step.name}`);

  born.push({
    id: handle(),
    instance: [threadType],
    name: step.name,
    body: {
      asks: step.asks,
      raised: raisedIn(step.raised).map(ref),
      stands: step.stands,
      ...(step.touches?.length ? { touches: step.touches.map(ref) } : {}),
      ...(step.awaits ? { awaits: true } : {}),
    },
  });
}

const holding = born.length
  ? [
      {
        ...threads,
        body: { ...threads.body, threads: [...born.map(({ id }) => ref(id)), ...threads.body.threads] },
      },
    ]
  : [];

const says =
  steps.flatMap((step) => ("says" in step ? [step.says] : [])).join(" ") ||
  [
    ...born.map(({ name }) => `Raised: ${name}.`),
    ...moved.map(({ name, body }) => `${name}: ${body.stands}.`),
  ].join(" ");

const done = await commitOf({
  holons: [...born, ...moved, ...holding, ...liftedIn.values(), ...writer.born],
  says,
});

console.log({
  raised: born.map(({ name }) => name),
  moved: moved.map(({ name }) => name),
  landed: done.landed,
});

// The engine here keeps its stores open; the tool is done.
process.exit(0);
