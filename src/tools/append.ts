// Appends one utterance of the author's to the session, as one commit: only the
// holons it adds or changes are written, as new versions, and nothing written
// before is touched.
// Usage: bun src/tools/append.ts <utterance.txt> <typed|spoken> [paths.json]
// In the text, {typed|meant} marks a fix, and _ inside it stands for a space.

import { commit, open, storeDir, type Holon } from "./blocks.ts";
import { proseWriter } from "./prose.ts";

type Patch = {
  add?: { title: string; opens: string; restsOn: string[] }[];
  edit?: { title: string; opens: string }[];
};

const ref = (to: string) => ({ $ref: to });

const [file, as, patchFile] = process.argv.slice(2);
const store = await open(storeDir);
const holons = [...(await store.holons()).values()].map((x) => x.holon);

const writer = proseWriter(holons, store.mint);
const { types, put, flow } = writer;

const session = holons.find((h) => h.instance[0] === types.session && (h.name ?? "").startsWith("A second session"))!;
const changed = new Set<Holon>([session]);

const text = await Bun.file(file!).text();
const order = session.body.said.length + 1;
const utterance = put("utterance", { as, order, flow: flow(text).map(ref) });
session.body.said.push(ref(utterance));

// A path patch: new paths, or a path's body changed in place by its title.
if (patchFile) {
  const patch: Patch = await Bun.file(patchFile).json();

  for (const { title, ...path } of patch.add ?? []) {
    session.body.paths.push(ref(put("path", { ...path, stands: "noted", from: [ref(utterance)] }, title)));
  }

  for (const { title, opens } of patch.edit ?? []) {
    const path = holons.find((h) => h.instance[0] === types.path && h.name === title);
    if (!path) throw new Error(`no path titled ${title}`);

    path.body.opens = opens;
    path.body.from.push(ref(utterance));
    changed.add(path);
  }
}

if (writer.lexiconGrew()) changed.add(writer.lexicon);

const done = await commit(store, [...changed, ...writer.born], `The second session, utterance ${order}`);
console.log({ utterance: order, holons: done.holons, blocks: done.blocks, bytes: done.bytes });
