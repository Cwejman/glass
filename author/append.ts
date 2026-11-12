// Appends one utterance to a session, as one commit: the author's in their own words,
// or an answer of the session's in its own voice. Only the holons it adds or changes are
// written, as new versions, and nothing written before is touched.
// Usage: bun author/append.ts <session's name, or its start> <utterance.txt> <typed|spoken|answered> [paths.json]
// In the author's text, {typed|meant} marks a fix, and _ inside it stands for a space.
// A path patch adds paths, or says one of the session's own again by its title:
//   { "add": [{ "title": "...", "opens": "...", "restsOn": ["..."] }],
//     "edit": [{ "title": "...", "opens": "..." }] }

import { handles } from "../engine/handles.ts";
import { localEngine } from "../engine/local.ts";
import { holonsOf, open, storeFolder, type Holon } from "../stores.ts";
import { markedWriter, proseWriter } from "./prose.ts";

type Patch = {
  add?: { title: string; opens: string; restsOn: string[] }[];
  edit?: { title: string; opens: string }[];
};

const ref = (to: string) => ({ $ref: to });

const [named, file, as, patchFile] = process.argv.slice(2);
if (!named || !file || !["typed", "spoken", "answered"].includes(as ?? ""))
  throw new Error("usage: append.ts <session> <utterance.txt> <typed|spoken|answered> [paths.json]");

const store = await open(await storeFolder("main"));
const holons = await holonsOf(store);

const writer = proseWriter(holons, handles());
const { types, put, flow } = writer;
const marked = markedWriter(writer);

const sessions = holons.filter((h) => h.instance[0] === types.session && (h.name ?? "").startsWith(named));
if (sessions.length !== 1) throw new Error(`${sessions.length} sessions begin with ${named}`);

const session = sessions[0]!;
const changed = new Set<Holon>([session]);
const author = holons.find((h) => h.name === "The author" && h.instance[0] === types.voice)!;

// The author's words are plain; the session's answers carry their marks, a paragraph a line.
const text = await Bun.file(file).text();
const answered = as === "answered";
const paragraphs = answered
  ? text
      .split("\n")
      .filter((line) => line.trim())
      .map(marked.paragraph)
  : flow(text);

if (answered && !session.body.voice) throw new Error(`${session.name} has no voice of its own to answer in`);

session.body.said ??= [];
session.body.paths ??= [];

const order = session.body.said.length + 1;
const utterance = put("utterance", {
  as: answered ? "answered by the session" : as,
  order,
  flow: paragraphs.map(ref),
  voice: answered ? session.body.voice : ref(author.id),
});
session.body.said.push(ref(utterance));

// A path patch: new paths, or one of the session's own said again by its title.
if (patchFile) {
  const patch: Patch = await Bun.file(patchFile).json();
  const own = new Set(((session.body.paths ?? []) as { $ref: string }[]).map(({ $ref }) => $ref));

  for (const { title, ...path } of patch.add ?? []) {
    session.body.paths.push(ref(put("path", { ...path, stands: "noted", from: [ref(utterance)] }, title)));
  }

  for (const { title, opens } of patch.edit ?? []) {
    const path = holons.find((h) => own.has(h.id) && h.name === title);
    if (!path) throw new Error(`the session has no path titled ${title}`);

    path.body.opens = opens;
    path.body.from = [...(path.body.from ?? []), ref(utterance)];
    changed.add(path);
  }
}

// The session's running cycle spans what is said while it runs.
const running = ((session.body.cycles ?? []) as { $ref: string }[])
  .map(({ $ref }) => holons.find((h) => h.id === $ref)!)
  .find((cycle) => cycle?.body.stands === "running");

if (running) {
  running.body.said = [...(running.body.said ?? []), ref(utterance)];
  changed.add(running);
}

const done = await (
  await localEngine({ writes: ["main"] })
).commit({
  holons: [...changed, ...writer.born],
  says: `${session.name}: utterance ${order}`,
});
console.log({
  utterance: order,
  holons: changed.size + writer.born.length,
  commit: done.commit,
});
