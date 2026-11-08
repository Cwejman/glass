// Adds a session kept in brief, as one commit: its voice, the utterances kept
// from it in the author's own words, the paths it noted, and the earlier paths
// it let go.
// Usage: bun src/tools/session.ts <session.json>
//
// {
//   "name": "...", "on": "2026-11-08", "kept": "how much of it was kept",
//   "said": [{ "order": 5, "as": "typed", "text": "..." }],
//   "paths": [{ "title": "...", "opens": "...", "restsOn": ["..."], "from": [5] }],
//   "letGo": ["the title of an earlier path"]
// }

import { commit, open, storeDir, type Holon } from "./blocks.ts";
import { proseWriter } from "./prose.ts";

type Said = { order: number; as: "typed" | "spoken"; text: string };
type Path = { title: string; opens: string; restsOn: string[]; from: number[] };
type Session = { name: string; on: string; kept: string; said: Said[]; paths: Path[]; letGo: string[] };

const ref = (to: string) => ({ $ref: to });

const session: Session = await Bun.file(process.argv[2]!).json();
const store = await open(storeDir);
const holons = [...(await store.holons()).values()].map((x) => x.holon);

const writer = proseWriter(holons, store.mint);
const { types, put, flow } = writer;

const author = holons.find((h) => h.name === "The author" && h.instance[0] === types.voice)!;
const sessions = holons.find((h) => h.name === "Sessions" && Array.isArray(h.body.sessions))!;

const utterances = new Map(
  session.said.map(({ order, as, text }) => [order, put("utterance", { as, order, flow: flow(text).map(ref), voice: ref(author.id) })]),
);

const paths = session.paths.map(({ title, opens, restsOn, from }) =>
  put("path", { opens, restsOn, stands: "noted", from: from.map((order) => ref(utterances.get(order)!)) }, title),
);

// A session and its voice name each other, so one name is taken before the other is written.
const sessionId = store.mint();
const voice = put("voice", { of: ref(sessionId) }, `A session of ${session.on}, on the store's format and the code upon it`);

const sessionHolon: Holon = {
  id: sessionId,
  instance: [types.session!],
  name: session.name,
  body: {
    on: session.on,
    kept: session.kept,
    voice: ref(voice),
    said: session.said.map(({ order }) => ref(utterances.get(order)!)),
    paths: paths.map(ref),
  },
};

const letGo = session.letGo.map((title) => {
  const path = holons.find((h) => h.instance[0] === types.path && h.name === title);
  if (!path) throw new Error(`no path titled ${title}`);

  path.body.stands = "let go";
  return path;
});

sessions.body.sessions.push(ref(sessionId));

const changed = [sessions, ...letGo, ...(writer.lexiconGrew() ? [writer.lexicon] : [])];
const born = [...writer.born, sessionHolon].sort((a, b) => (a.id < b.id ? -1 : 1));

console.log(await commit(store, [...changed, ...born], session.name));
