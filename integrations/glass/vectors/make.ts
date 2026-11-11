// Writes format.json: small stores, byte for byte, made apart from the code they
// test. It imports nothing of Glass's: the lines are written out by hand here, in
// canonical form, and hashed with the platform's SHA-256. Lines written before
// 2026-11-11 name their parent and count no runs; they are kept to prove they still read.
// Usage: bun integrations/glass/vectors/make.ts

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const A = "1M6XGF6G0",
  B = "1M6XGF7H0",
  C = "1M6XGF8J0";
const T = `${A}000100`,
  word = `${A}000101`,
  gone = `${A}000102`;
const W2 = `${B}000200`,
  W3 = `${C}000000`;

// First commit: a type and two holons.
const block1 =
  `{"body":{"text":"type"},"id":"${T}","instance":[],"mould":{"text":{}},"name":"word","prev":null}\n` +
  `{"body":{"text":"one"},"id":"${word}","instance":["${T}"],"prev":null}\n` +
  `{"body":{"text":"two"},"id":"${gone}","instance":["${T}"],"prev":null}\n`;
const h1 = sha(block1);
const line1 = `{"at":"2026-11-08T00:00:00.000Z","blocks":[{"first":"${T}","hash":"${h1}","moved":[],"new":3}],"checkpoint":{"blocks":[["${h1}","${T}",3]],"gone":[],"moved":[]},"gone":[],"predecessor":null,"says":"first"}`;
const r1 = sha(line1);
const before1 = `{"at":"2026-11-08T00:00:00.000Z","blocks":[{"first":"${T}","hash":"${h1}","moved":[],"new":3}],"checkpoint":{"blocks":[["${h1}","${T}"]],"gone":[],"moved":[]},"gone":[],"parent":null,"says":"first"}`;

// Second commit: one new holon that points at an old one, one edit, one taken out.
const block2 =
  `{"body":{"next":{"$ref":"${word}"},"text":"three"},"id":"${W2}","instance":["${T}"],"prev":null}\n` +
  `{"body":{"text":"one, edited"},"id":"${word}","instance":["${T}"],"prev":"${h1}"}\n`;
const h2 = sha(block2);
const line2 = `{"at":"2026-11-08T00:01:00.000Z","blocks":[{"first":"${W2}","hash":"${h2}","moved":["${word}"],"new":1}],"gone":["${gone}"],"predecessor":"${r1}","says":"second"}`;
const r2 = sha(line2);
const before2 = `{"at":"2026-11-08T00:01:00.000Z","blocks":[{"first":"${W2}","hash":"${h2}","moved":["${word}"],"new":1}],"gone":["${gone}"],"parent":"${sha(before1)}","says":"second"}`;

// What a commit says, apart from where it stands: the same for a line written before
// and one written now, and in every store an act touched.
const actOf = (at: string, blocks: string, gone: string, says: string) =>
  sha(`{"at":"${at}","blocks":${blocks},"gone":${gone},"says":"${says}"}`);

const steps = [
  {
    says: "first",
    at: "2026-11-08T00:00:00.000Z",
    gone: [],
    holons: [
      { id: T, instance: [], name: "word", mould: { text: {} }, body: { text: "type" } },
      { id: word, instance: [T], body: { text: "one" } },
      { id: gone, instance: [T], body: { text: "two" } },
    ],
    blocks: { [h1]: block1 },
    log: [line1],
    ref: `${r1} 0\n`,
    field: { [T]: "type", [word]: "one", [gone]: "two" },
  },
  {
    says: "second",
    at: "2026-11-08T00:01:00.000Z",
    gone: [gone],
    holons: [
      { id: W2, instance: [T], body: { next: { $ref: word }, text: "three" } },
      { id: word, instance: [T], body: { text: "one, edited" } },
    ],
    blocks: { [h2]: block2 },
    log: [line1, line2],
    ref: `${r2} 0\n`,
    field: { [T]: "type", [word]: "one, edited", [W2]: "three" },
  },
];

// A second copy that started from the first commit lands on the first copy's second.
const landBlock = `{"body":{"text":"four"},"id":"${W3}","instance":["${T}"],"prev":null}\n`;
const lh = sha(landBlock);
const landed = `{"at":"2026-11-08T00:02:00.000Z","blocks":[{"first":"${W3}","hash":"${lh}","moved":[],"new":1}],"gone":[],"predecessor":"${r2}","says":"third, written apart"}`;

// Lines written before, read as they are, and a commit written on after them.
const afterBlock = `{"body":{"text":"after"},"id":"${W3}","instance":["${T}"],"prev":null}\n`;
const ah = sha(afterBlock);
const after = `{"at":"2026-11-08T00:03:00.000Z","blocks":[{"first":"${W3}","hash":"${ah}","moved":[],"new":1}],"gone":[],"predecessor":"${sha(before2)}","says":"after"}`;

// An act across two stores, a and b, each empty. Its ids are one run, minted together:
// a keeps the first and the third, b the second and the third. In a, the first is its
// own run and the third arrives, moved with no prev; in b the second and third are a run.
const D = "1M6XGF9K0";
const [first, second, third] = [`${D}000300`, `${D}000301`, `${D}000302`];
const blockA =
  `{"body":{"text":"in a"},"id":"${first}","instance":[],"prev":null}\n` +
  `{"body":{"text":"in both"},"id":"${third}","instance":[],"prev":null}\n`;
const blockB =
  `{"body":{"text":"in b"},"id":"${second}","instance":[],"prev":null}\n` +
  `{"body":{"text":"in both"},"id":"${third}","instance":[],"prev":null}\n`;
const [ha, hb] = [sha(blockA), sha(blockB)];
const entryA = `{"first":"${first}","hash":"${ha}","moved":["${third}"],"new":1}`;
const entryB = `{"first":"${second}","hash":"${hb}","moved":[],"new":2}`;
const actBlocks = `[${[
  [ha, entryA],
  [hb, entryB],
]
  .sort(([x], [y]) => (x! < y! ? -1 : 1))
  .map(([, entry]) => entry)
  .join(",")}]`;
const at1 = "2026-11-11T00:00:00.000Z";
const at2 = "2026-11-11T00:01:00.000Z";
const actSays = "an act across two stores";
const goneSays = "taken out of the field";
const lineA1 = `{"at":"${at1}","blocks":${actBlocks},"checkpoint":{"blocks":[["${ha}","${first}",1]],"gone":[],"moved":[["${third}","${ha}"]]},"gone":[],"own":["${ha}"],"predecessor":null,"says":"${actSays}"}`;
const lineB1 = `{"at":"${at1}","blocks":${actBlocks},"checkpoint":{"blocks":[["${hb}","${second}",2]],"gone":[],"moved":[]},"gone":[],"own":["${hb}"],"predecessor":null,"says":"${actSays}"}`;
const lineA2 = `{"at":"${at2}","blocks":[],"gone":["${third}"],"own":[],"predecessor":"${sha(lineA1)}","says":"${goneSays}"}`;
const lineB2 = `{"at":"${at2}","blocks":[],"gone":["${third}"],"own":[],"predecessor":"${sha(lineB1)}","says":"${goneSays}"}`;

// Gone said in runs: after the first commit, the two holons that follow the type are
// taken out together, and the line says them as one run, the first and how many.
const runLine = `{"at":"2026-11-08T00:01:00.000Z","blocks":[],"gone":[["${word}",2]],"predecessor":"${r1}","says":"two taken out"}`;

const vectors = {
  steps,
  land: {
    from: 1,
    says: "third, written apart",
    at: "2026-11-08T00:02:00.000Z",
    holons: [{ id: W3, instance: [T], body: { text: "four" } }],
    block: { [lh]: landBlock },
    log: [line1, line2, landed],
    ref: `${sha(landed)} 0\n`,
    field: { [T]: "type", [word]: "one, edited", [W2]: "three", [W3]: "four" },
  },
  before: {
    blocks: { [h1]: block1, [h2]: block2 },
    log: [before1, before2],
    ref: `${sha(before2)} 0\n`,
    field: steps[1]!.field,
    acts: [
      actOf(
        "2026-11-08T00:00:00.000Z",
        `[{"first":"${T}","hash":"${h1}","moved":[],"new":3}]`,
        "[]",
        "first",
      ),
      actOf(
        "2026-11-08T00:01:00.000Z",
        `[{"first":"${W2}","hash":"${h2}","moved":["${word}"],"new":1}]`,
        `["${gone}"]`,
        "second",
      ),
    ],
    after: {
      says: "after",
      at: "2026-11-08T00:03:00.000Z",
      holons: [{ id: W3, instance: [T], body: { text: "after" } }],
      block: { [ah]: afterBlock },
      log: [before1, before2, after],
      ref: `${sha(after)} 0\n`,
    },
  },
  act: {
    first: {
      says: actSays,
      at: at1,
      born: [first, second, third],
      stores: [
        {
          holons: [
            { id: first, instance: [], body: { text: "in a" } },
            { id: third, instance: [], body: { text: "in both" } },
          ],
          block: { [ha]: blockA },
          log: [lineA1],
          ref: `${sha(lineA1)} 0\n`,
          field: { [first]: "in a", [third]: "in both" },
        },
        {
          holons: [
            { id: second, instance: [], body: { text: "in b" } },
            { id: third, instance: [], body: { text: "in both" } },
          ],
          block: { [hb]: blockB },
          log: [lineB1],
          ref: `${sha(lineB1)} 0\n`,
          field: { [second]: "in b", [third]: "in both" },
        },
      ],
      content: actOf(at1, actBlocks, "[]", actSays),
    },
    then: {
      says: goneSays,
      at: at2,
      gone: [third],
      stores: [
        { log: [lineA1, lineA2], ref: `${sha(lineA2)} 0\n`, field: { [first]: "in a" } },
        { log: [lineB1, lineB2], ref: `${sha(lineB2)} 0\n`, field: { [second]: "in b" } },
      ],
      content: actOf(at2, "[]", `["${third}"]`, goneSays),
    },
  },
  goneRun: {
    says: "two taken out",
    at: "2026-11-08T00:01:00.000Z",
    gone: [word, gone],
    log: [line1, runLine],
    ref: `${sha(runLine)} 0\n`,
    field: { [T]: "type" },
    act: actOf("2026-11-08T00:01:00.000Z", "[]", `[["${word}",2]]`, "two taken out"),
  },
  history: { "0": { [T]: "type", [word]: "one", [gone]: "two" }, "1": steps[1]!.field },
  versions: { id: word, texts: ["one, edited", "one"] },
  ids: {
    next: [
      ["1M6XGF6G000000V", "1M6XGF6G000000W"],
      ["1M6XGF6G00000ZZ", "1M6XGF6G0000100"],
    ],
  },
};
writeFileSync(join(import.meta.dir, "format.json"), JSON.stringify(vectors, null, 1) + "\n");
console.log(`format.json: ${steps.length} steps, heads ${r1.slice(0, 8)} ${r2.slice(0, 8)}`);
