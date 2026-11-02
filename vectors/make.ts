// Writes the store's test vectors. It shares no code with glass: objects are
// built by hand here, written canonically by the small writer below, and named
// by the system's own `shasum`, so an implementation that passes them agrees
// with something other than itself.

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const here = import.meta.dir;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function name(text: string) {
  const result = spawnSync("shasum", ["-a", "256"], { input: text });
  return `sha256-${result.stdout.toString().split(" ")[0]}`;
}

const canonicalCases = [
  {
    about: "RFC 8785, section 3.2.2: literals, numbers and strings",
    json: '{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],"string":"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/","literals":[null,true,false]}',
    canonical: '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
  },
  {
    about: "RFC 8785, section 3.2.3: keys sorted by UTF-16 code units",
    json: '{"\\u20ac":"Euro Sign","\\r":"Carriage Return","\\ufb33":"Hebrew Letter Dalet With Dagesh","1":"One","\\ud83d\\ude00":"Emoji: Grinning Face","\\u0080":"Control","\\u00f6":"Latin Small Letter O With Diaeresis"}',
    canonical:
      '{"\\r":"Carriage Return","1":"One","\u0080":"Control","ö":"Latin Small Letter O With Diaeresis","€":"Euro Sign","😀":"Emoji: Grinning Face","דּ":"Hebrew Letter Dalet With Dagesh"}',
  },
  {
    about: "nesting and whitespace",
    json: '{ "b" : [ 1 , { "z" : null , "a" : "x" } ] , "a" : { } }',
    canonical: '{"a":{},"b":[1,{"a":"x","z":null}]}',
  },
].map((c) => ({ ...c, name: name(c.canonical) }));

// Three commits on one store, each listing every object it adds.
const A = "01JB0000000000000000000001";
const B = "01JB0000000000000000000002";
const TYPE = "01JB0000000000000000000000";
const steps: { about: string; change: unknown; objects: unknown[] }[] = [];
const named = (object: unknown) => [name(canonical(object)), object] as const;

const typeV1 = named({ kind: "version", id: TYPE, prev: null, instance: [TYPE], body: { title: "Note" } });
const aV1 = named({ kind: "version", id: A, prev: null, instance: [TYPE], body: { title: "First" } });
const bV1 = named({ kind: "version", id: B, prev: null, instance: [TYPE], body: { title: "Second", about: { $ref: A } } });
const leaf1 = named({ kind: "index-leaf", depth: 0, versions: { [TYPE]: typeV1[0], [A]: aV1[0], [B]: bV1[0] } });
const index1 = named({ kind: "index", names: { note: TYPE }, holons: leaf1[0] });
const commit1 = named({ kind: "commit", parent: null, at: "2026-11-03T09:00:00Z", index: index1[0] });
steps.push({
  about: "a first commit: three holons born, one name given",
  change: {
    at: "2026-11-03T09:00:00Z",
    names: { note: TYPE },
    holons: [
      { id: TYPE, instance: [TYPE], body: { title: "Note" } },
      { id: A, instance: [TYPE], body: { title: "First" } },
      { id: B, instance: [TYPE], body: { title: "Second", about: { $ref: A } } },
    ],
  },
  objects: [typeV1, aV1, bV1, leaf1, index1, commit1],
});

const aV2 = named({ kind: "version", id: A, prev: aV1[0], instance: [TYPE], body: { title: "First, again" } });
const leaf2 = named({ kind: "index-leaf", depth: 0, versions: { [TYPE]: typeV1[0], [A]: aV2[0], [B]: bV1[0] } });
const index2 = named({ kind: "index", names: { note: TYPE }, holons: leaf2[0] });
const commit2 = named({ kind: "commit", parent: commit1[0], at: "2026-11-03T09:01:00Z", index: index2[0] });
steps.push({
  about: "one holon changed, one left as it was: only the changed one gets a version",
  change: {
    at: "2026-11-03T09:01:00Z",
    holons: [
      { id: A, instance: [TYPE], body: { title: "First, again" } },
      { id: B, instance: [TYPE], body: { title: "Second", about: { $ref: A } } },
    ],
  },
  objects: [aV2, leaf2, index2, commit2],
});

// 64 more holons make 67, past a leaf's 64, so the tree branches on the last
// character of the ids. Their ids end in each of 32 characters, two or three
// to a character.
const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const many = Array.from({ length: 64 }, (_, i) => `01JC${String(i).padStart(20, "0").slice(0, 20)}${alphabet[i % 32]}${alphabet[i % 32]}`.slice(0, 26));
const manyVersions = many.map((id, i) => named({ kind: "version", id, prev: null, instance: [TYPE], body: { title: `Note ${i}` } }));
const all: [string, string][] = [
  [TYPE, typeV1[0]],
  [A, aV2[0]],
  [B, bV1[0]],
  ...many.map((id, i) => [id, manyVersions[i]![0]] as [string, string]),
];
const leaves = new Map<string, Record<string, string>>();
for (const [id, version] of all) {
  const char = id[id.length - 1]!;
  leaves.set(char, { ...leaves.get(char), [id]: version });
}
const leafObjects = [...leaves].map(([char, versions]) => [char, named({ kind: "index-leaf", depth: 1, versions })] as const);
const branch = named({ kind: "index-branch", depth: 0, branches: Object.fromEntries(leafObjects.map(([char, leaf]) => [char, leaf[0]])) });
const index3 = named({ kind: "index", names: { note: TYPE }, holons: branch[0] });
const commit3 = named({ kind: "commit", parent: commit2[0], at: "2026-11-03T09:02:00Z", index: index3[0] });
steps.push({
  about: "past 64 holons the leaf becomes a branch over the last character of the ids",
  change: {
    at: "2026-11-03T09:02:00Z",
    holons: many.map((id, i) => ({ id, instance: [TYPE], body: { title: `Note ${i}` } })),
  },
  objects: [...manyVersions, ...leafObjects.map(([, leaf]) => leaf), branch, index3, commit3],
});

const store = {
  about: "Commits applied in order to an empty store. After each, the ref main names the step's last object, and the store has gained exactly the objects listed, each at its name.",
  steps: steps.map((step) => ({
    about: step.about,
    change: step.change,
    ref: (step.objects.at(-1) as readonly [string, unknown])[0],
    objects: Object.fromEntries(step.objects as (readonly [string, unknown])[]),
  })),
};

writeFileSync(join(here, "canonical.json"), JSON.stringify(canonicalCases, null, 2) + "\n");
writeFileSync(join(here, "store.json"), JSON.stringify(store, null, 2) + "\n");
console.log(`${canonicalCases.length} canonical cases, ${steps.length} store steps`);
