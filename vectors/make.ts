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

// Commits on one store, each listing every object it adds. The tree is built
// here from scratch, from the whole set of ids at each commit, by its rule: a
// leaf holds at most 64; past that it is a branch over the next character
// from the end. The store under test grows its tree commit by commit instead.

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const id = (group: string, n: number, end: string) => {
  let digits = "";
  for (let rest = n, i = 0; i < 22 - end.length; i++, rest = Math.floor(rest / 32)) digits = alphabet[rest % 32] + digits;
  const made = `01J${group}${digits}${end}`;
  if (made.length !== 26) throw new Error(`a bad id ${made}`);
  return made;
};

const TYPE = "01JB0000000000000000000000";
const A = "01JB0000000000000000000001";
const B = "01JB0000000000000000000002";

type Named = readonly [string, unknown];
const named = (object: unknown): Named => [name(canonical(object)), object];

const versions = new Map<string, Named>();
let names: Record<string, string> = {};
let head: string | null = null;
const written = new Set<string>();

function tree(entries: [string, string][], depth: number, out: Named[]): string {
  if (entries.length <= 64) {
    const leaf = named({ kind: "index-leaf", depth, versions: Object.fromEntries(entries) });
    out.push(leaf);
    return leaf[0];
  }
  const groups = new Map<string, [string, string][]>();
  for (const entry of entries) {
    const char = entry[0][entry[0].length - 1 - depth]!;
    groups.set(char, [...(groups.get(char) ?? []), entry]);
  }
  const branches: Record<string, string> = {};
  for (const [char, group] of groups) branches[char] = tree(group, depth + 1, out);
  const branch = named({ kind: "index-branch", depth, branches });
  out.push(branch);
  return branch[0];
}

type Holon = { id: string; instance: string[]; body: Record<string, unknown> };
const steps: { about: string; change: unknown; ref: string | null; objects: Record<string, unknown> }[] = [];

function step(about: string, at: string, holons: Holon[], givenNames?: Record<string, string | null>, gone: string[] = []) {
  const made: Named[] = [];
  for (const holon of holons) {
    const prev = versions.get(holon.id);
    const old = prev?.[1] as Holon | undefined;
    if (old && canonical([old.instance, old.body]) === canonical([holon.instance, holon.body])) continue;
    const version = named({ kind: "version", id: holon.id, prev: prev?.[0] ?? null, instance: holon.instance, body: holon.body });
    versions.set(holon.id, version);
    made.push(version);
  }
  const nextNames = { ...names };
  for (const [key, value] of Object.entries(givenNames ?? {})) {
    if (value === null) delete nextNames[key];
    else nextNames[key] = value;
  }
  const namesChanged = canonical(nextNames) !== canonical(names);
  const taken = gone.filter((id) => versions.has(id));
  for (const id of taken) versions.delete(id);
  const change = { at, holons, ...(givenNames ? { names: givenNames } : {}), ...(gone.length ? { gone } : {}) };
  if (made.length === 0 && !namesChanged && taken.length === 0) {
    steps.push({ about, change, ref: head, objects: {} });
    return;
  }
  names = nextNames;
  tree([...versions].map(([key, version]) => [key, version[0]]), 0, made);
  const holonsRoot = made.at(-1)![0];
  const index = named({ kind: "index", names, holons: holonsRoot });
  const commit = named({ kind: "commit", parent: head, at, index: index[0] });
  made.push(index, commit);
  head = commit[0];
  const objects: Record<string, unknown> = {};
  for (const [key, object] of made) if (!written.has(key)) objects[key] = object;
  for (const key of Object.keys(objects)) written.add(key);
  steps.push({ about, change, ref: head, objects });
}

const note = (holonId: string, title: string, extra: Record<string, unknown> = {}): Holon => ({
  id: holonId,
  instance: [TYPE],
  body: { title, ...extra },
});

step("a first commit: three holons born, one name given", "2026-11-03T09:00:00Z",
  [note(TYPE, "Note"), note(A, "First"), note(B, "Second", { about: { $ref: A } })], { note: TYPE });
step("one holon changed, one left as it was: only the changed one gets a version", "2026-11-03T09:01:00Z",
  [note(A, "First, again"), note(B, "Second", { about: { $ref: A } })]);
step("61 more make 64 holons, which one leaf still holds", "2026-11-03T09:02:00Z",
  Array.from({ length: 61 }, (_, i) => note(id("C", i, alphabet[i % 32]!), `Note ${i}`)));
step("one more makes 65, and the leaf becomes a branch over the last character of the ids", "2026-11-03T09:03:00Z",
  [note(id("C", 61, "Q"), "Note 61")]);
step("65 holons whose ids all end in Z: that leaf passes 64 and branches over the second character from the end", "2026-11-03T09:04:00Z",
  Array.from({ length: 65 }, (_, i) => note(id("D", i, alphabet[i % 32]! + "Z"), `Zed ${i}`)));
step("only names change: one taken away, one given; the tree is shared whole", "2026-11-03T09:05:00Z",
  [], { note: null, type: TYPE });
step("only what a holon is an instance of changes", "2026-11-03T09:06:00Z",
  [{ id: B, instance: [TYPE, A], body: { title: "Second", about: { $ref: A } } }]);
step("a change that changes nothing makes no commit, and the ref stays", "2026-11-03T09:07:00Z",
  [note(A, "First, again")]);
step("three holons taken out: the 66 ending in Z fall to 64, and their branch becomes a leaf again, as if the others had never been", "2026-11-03T09:08:00Z",
  [], undefined, [id("D", 0, "0Z"), id("D", 1, "1Z"), A]);

const store = {
  about: "Changes applied in order to an empty store. After each, the ref main names the step's ref, and the store has gained exactly the objects listed, each at its name. A step that adds nothing makes no commit.",
  steps,
};

writeFileSync(join(here, "canonical.json"), JSON.stringify(canonicalCases, null, 2) + "\n");
writeFileSync(join(here, "store.json"), JSON.stringify(store, null, 2) + "\n");
console.log(`${canonicalCases.length} canonical cases, ${steps.length} store steps, ${written.size} objects`);
