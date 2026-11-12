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

import { handles } from "../engine/act.ts";
import { localEngine } from "../engine/local.ts";
import { holonsOf, open, storeFolder, typeNamed, typesOf, type Holon } from "../stores.ts";

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
const refsOf = (list: unknown) => ((list ?? []) as { $ref: string }[]).map(({ $ref }) => $ref);

const steps: Step[] = await Bun.file(process.argv[2]!).json();
const store = await open(await storeFolder("main"));
const holons = await holonsOf(store);
const byId = new Map(holons.map((holon) => [holon.id, holon]));
const handle = handles();

const types = typesOf(holons);
const threadType = typeNamed(types, "thread");
const threads = holons.find((holon) => holon.instance[0] === typeNamed(types, "threads"))!;
const threadNamed = (name: string) =>
  holons.find((holon) => holon.instance[0] === threadType && holon.name === name);

// A sentence as it reads: its words, each with what stands before and after it, a space
// between them, so a phrase is found in it, if not its exact marks.
const sentenceText = (id: string): string =>
  refsOf(byId.get(id)!.body.words)
    .map((word) => {
      const { body } = byId.get(word)!;
      return body.text === undefined
        ? sentenceText(word)
        : `${body.before ?? ""}${body.text}${body.after ?? ""}`;
    })
    .join(" ");

// The sentences an utterance said, those that say the words given where words are given.
function raisedIn({ session, order, words }: Raise["raised"]) {
  const kept = holons.find((holon) => holon.name?.startsWith(session) && holon.body.said);
  if (!kept) throw new Error(`no session named ${session}`);

  const utterance = refsOf(kept.body.said)
    .map((id) => byId.get(id)!)
    .find((one) => one.body.order === order);
  if (!utterance) throw new Error(`${kept.name} has no utterance ${order}`);

  const sentences = refsOf(utterance.body.flow).flatMap((paragraph) =>
    refsOf(byId.get(paragraph)!.body.sentences),
  );
  const saying = words ? sentences.filter((id) => sentenceText(id).includes(words)) : sentences;
  if (!saying.length) throw new Error(`utterance ${order} of ${kept.name} never says “${words}”`);

  return saying;
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

const done = await (
  await localEngine({ writes: ["main"] })
).commit({ holons: [...born, ...moved, ...holding], says });

console.log({
  raised: born.map(({ name }) => name),
  moved: moved.map(({ name }) => name),
  commit: done.commit,
});
