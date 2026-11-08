// Writes format.json: a small store, byte for byte, made apart from the code it
// tests. It imports nothing of Glass's: the lines are written out by hand here,
// in canonical form, and hashed with the platform's SHA-256.
// Usage: bun src/store/vectors/make.ts

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
const line1 = `{"at":"2026-11-08T00:00:00.000Z","blocks":[{"first":"${T}","hash":"${h1}","moved":[],"new":3}],"checkpoint":{"blocks":[["${h1}","${T}"]],"gone":[],"moved":[]},"gone":[],"parent":null,"says":"first"}`;
const r1 = sha(line1);

// Second commit: one new holon that points at an old one, one edit, one taken out.
const block2 =
  `{"body":{"next":{"$ref":"${word}"},"text":"three"},"id":"${W2}","instance":["${T}"],"prev":null}\n` +
  `{"body":{"text":"one, edited"},"id":"${word}","instance":["${T}"],"prev":"${h1}"}\n`;
const h2 = sha(block2);
const line2 = `{"at":"2026-11-08T00:01:00.000Z","blocks":[{"first":"${W2}","hash":"${h2}","moved":["${word}"],"new":1}],"gone":["${gone}"],"parent":"${r1}","says":"second"}`;
const r2 = sha(line2);

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
const landed = `{"at":"2026-11-08T00:02:00.000Z","blocks":[{"first":"${W3}","hash":"${lh}","moved":[],"new":1}],"gone":[],"parent":"${r2}","says":"third, written apart"}`;

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
  history: { "0": { [T]: "type", [word]: "one", [gone]: "two" }, "1": steps[1]!.field },
  versions: { id: word, texts: ["one, edited", "one"] },
  names: {
    next: [
      ["1M6XGF6G000000V", "1M6XGF6G000000W"],
      ["1M6XGF6G00000ZZ", "1M6XGF6G0000100"],
    ],
  },
};
writeFileSync(join(import.meta.dir, "format.json"), JSON.stringify(vectors, null, 1) + "\n");
console.log(`format.json: ${steps.length} steps, heads ${r1.slice(0, 8)} ${r2.slice(0, 8)}`);
