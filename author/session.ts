// Adds a session as one commit: its voice, the utterances kept from it, the
// author's in their own words and any answers of the session's, the paths it
// noted, and the earlier paths it let go.
// Usage: bun author/session.ts <session.json>
//
// {
//   "name": "...", "on": "2026-11-08", "kept": "how much of it was kept",
//   "voice": "what the session's own voice is called",
//   "said": [{ "order": 5, "as": "typed", "text": "..." }],   as: typed, spoken, or answered by the session
//   "paths": [{ "title": "...", "opens": "...", "restsOn": ["..."], "from": [5] }],
//   "letGo": ["the title of an earlier path"]
// }

import { localEngine } from "../engine/local.ts";
import { holonsOf, open, storeFolder, type Holon } from "../stores.ts";
import { markedWriter, proseWriter } from "./prose.ts";

type Said = { order: number; as: "typed" | "spoken" | "answered by the session"; text: string };
type Path = { title: string; opens: string; restsOn: string[]; from: number[] };
type Session = {
  name: string;
  on: string;
  kept: string;
  voice: string;
  said: Said[];
  paths: Path[];
  letGo: string[];
};

const ref = (to: string) => ({ $ref: to });

const session: Session = await Bun.file(process.argv[2]!).json();
const store = await open(await storeFolder("main"));
const holons = await holonsOf(store);
const mint = store.minter();

const writer = proseWriter(holons, mint);
const { types, put, flow } = writer;
const marked = markedWriter(writer);

const author = holons.find((h) => h.name === "The author" && h.instance[0] === types.voice)!;
const sessions = holons.find((h) => h.name === "Sessions" && Array.isArray(h.body.sessions))!;

// A session and its voice name each other, so one name is taken before the other is written.
const sessionId = mint();
const voice = put("voice", { of: ref(sessionId) }, session.voice);

// The author's words are plain; the session's answers carry their marks.
const said = ({ as, text }: Said) =>
  as === "answered by the session"
    ? text
        .split("\n")
        .filter((line) => line.trim())
        .map(marked.paragraph)
    : flow(text);

const utterances = new Map(
  session.said.map((one) => [
    one.order,
    put("utterance", {
      as: one.as,
      order: one.order,
      flow: said(one).map(ref),
      voice: ref(one.as === "answered by the session" ? voice : author.id),
    }),
  ]),
);

const paths = session.paths.map(({ title, opens, restsOn, from }) =>
  put(
    "path",
    { opens, restsOn, stands: "noted", from: from.map((order) => ref(utterances.get(order)!)) },
    title,
  ),
);

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
  // Of paths that share a title, the one still noted is the one let go.
  const path = holons.find(
    (h) => h.instance[0] === types.path && h.name === title && h.body.stands === "noted",
  );
  if (!path) throw new Error(`no path titled ${title}`);

  path.body.stands = "let go";
  return path;
});

sessions.body.sessions.push(ref(sessionId));

const changed = [sessions, ...letGo];
const born = [...writer.born, sessionHolon].sort((a, b) => (a.id < b.id ? -1 : 1));

const done = await (await localEngine({ writes: ["main"] })).commit({ holons: [...changed, ...born], says: session.name });
console.log({ holons: changed.length + born.length, commit: done.commit });
