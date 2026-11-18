// The new engine held to the earlier one: every store this repository holds converted
// into strata, its expressions written again as uses (uses/migrate.ts), then each text
// below asked of both, the earlier engine over the stores as they are kept, read into the
// earlier form, and the new one over the strata, read into uses, and every answer
// compared. A text names holons by their names, never by the ids the migration mints.
// What differs is shown, and the run fails; a native the new engine refuses, saying what
// to write instead, is counted apart.
//
// Usage: bun engine/next/parity.ts [folder for the strata] [--workers]
//
// The strata are converted into the folder given unless they are already there, so a
// second run starts at once; without one, a folder of the system's is made and let go.
// --workers runs every store and the engine's workers each in a worker of its own.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { namesAsked } from "../../language/names.ts";
import { parse, syntax, toRead } from "../../language/text.ts";
import { sameThread, workers } from "../../runtime/runtime.ts";
import { storesHere } from "../../stores.ts";
import type { Store } from "../../stores/store.ts";
import { convert } from "../../stores/strata/convert.ts";
import { folderStorage } from "../../stores/strata/storage/folder.ts";
import { strata } from "../../stores/strata/strata.ts";
import { localEngine } from "../serve/local.ts";
import { engine } from "./engine.ts";
import { migrate } from "./uses/migrate.ts";

// Each a question the field is asked today, one native or function at least once.
const asked = [
  // values, lists and records
  `add(2, 3)`,
  `[3, 1, 2] | sort`,
  `[3, 1, 2] | sort(x => mul(x, -1)) | reverse | first`,
  `[1, 2, 2, 3] | distinct | size`,
  `[1, 2, 3] | fold(0, (a, b) => add(a, b))`,
  `[1, 2, 3, 4] | skip(1) | take(2)`,
  `concat([1], [2, 3]) | minus([2])`,
  `{a: 1} | put("b", 2) | keys`,
  `words("Glass, the field; ONE field")`,
  `contains("glass holds holons", "holons glass")`,
  `join(["a", null, "b"], "-")`,
  `[null, 1] | map(x => else(x, 0))`,
  `case("b", {a: 1, b: 2}, 3)`,
  `if(lt(1, 2), "yes", "no")`,
  `kind(@Knowledge)`,
  `round(2.6)`,
  `apply(x => add(x, 1), 4)`,
  `[1, 2, 3] | last`,
  `has([1, 2], 2)`,

  // holons
  `@Knowledge`,
  `@Knowledge.name`,
  `get(@Knowledge, "instance")`,
  `get(@Knowledge, "store")`,
  `keys(@Knowledge)`,
  `says(@Knowledge)`,
  `out(@Knowledge)`,
  `in(@Knowledge)`,
  `in(@main:types/brief) | size`,
  `out(@main:types/brief)`,
  `get(@main:types/brief, "mould")`,
  `parts(@Knowledge) | size`,
  `is(@Knowledge, @main:types/brief)`,
  `route(@"The design")`,
  `roots()`,
  `stores()`,
  `in(@main:types/thread)`,
  `in(@awaiting)`,
  `out(@1M75V5H7T0F7000)`,
  `find(?b, [?b, "widgets", @awaiting])`,
  `find({b: ?b, k: ?k}, [?b, ?k, @main:types/thread]) | size`,
  `follow([@Knowledge], [h => get(h, "sections")]) | size`,

  // prose and measure
  `text(@Knowledge)`,
  `text(@"The design", 2)`,
  `outline(@Knowledge, 3)`,
  `measure(@Knowledge)`,
  `digest(@"The design", 2000) | size`,
  `awaiting()`,
  `tldr()`,

  // patterns
  `find(?b, [?b, "instance", @main:types/brief]) | size`,
  `find(?t, [?t, "instance", @main:types/thread]) | map(t => {name: t.name, stands: t.stands})`,
  `find(?w, said(?w, "text", "holon")) | size`,
  `find(?w, said(?w, "text", "Sovereignty")) | size`,
  `find({t: ?t, n: ?n}, [?t, "instance", @main:types/thread], [?t, "name", ?n], [?t, "stands", "open"]) | size`,
  `find(?b, [?b, "instance", @main:types/brief], not([?b, "instance", @main:types/thread])) | size`,
  `find(?s, [?s, "instance", @main:types/session]) | map(s => s.name)`,
  `find(?f, [?f, "instance", @glass:types/function]) | map(f => f.name) | sort`,
  `find(?h, [?w, "$holds", ?h], [?w, "name", "Knowledge"]) | size`,
  `find(?h, [?h, "store", "paper"]) | size`,
  `explain(find(?b, [?b, "instance", @main:types/brief]))`,

  // history
  `log("glass") | size`,
  `log("site") | first`,
  `log("main") | take(3) | map(c => c.says)`,

  // the earlier natives still called by functions in the field
  `type(@main:types/thread) | size`,
  `named("Knowledge")`,
  `children(@Knowledge) | size`,
  `parents(@"The design")`,
  `search("sovereignty") | size`,
  `types() | size`,
  `store("site") | size`,
  `level(store("site")) | size`,
  `everything() | size`,
  `unified() | size`,
  `lexicon() | size`,
  `since("main", "2026-11-16T00:00:00.000Z") | size`,
  `group(type(@main:types/thread), "parent") | size`,
  `flat(store("site")) | size`,
  `and(type(@main:types/brief), children(@Knowledge)) | size`,
  `or(type(@main:types/thread), type(@main:types/session)) | size`,
  `not(type(@main:types/brief)) | size`,
  `points(@Knowledge) | size`,
  `pointers(@main:types/thread) | size`,
];

// Where the new engine answers otherwise on purpose, and why; shown, and not counted as
// differing.
const otherwise: Record<string, string> = {
  "in(@main:types/thread)": "a holon referring twice under one key is one fact, so said once",
  "in(@awaiting)": "a holon referring twice under one key is one fact, so said once",
  'log("site") | first': "the log is newest first, each commit with when, by and at, as the store keeps it",
  'log("main") | take(3) | map(c => c.says)': "the log is newest first",
};

const args = process.argv.slice(2);
const inWorkers = args.includes("--workers");
const given = args.find((arg) => !arg.startsWith("--"));
const folder = given ?? mkdtempSync(join(tmpdir(), "glass-parity-"));
const names = [...(await storesHere()).keys()];

for (const name of names) {
  const into = join(folder, name);
  if (existsSync(join(into, "head"))) continue;
  const from = performance.now();
  await convert(name, into);
  console.log(`${name} converted in ${Math.round(performance.now() - from)} ms`);
}

const earlier = await localEngine();
const runtime = inWorkers ? workers() : sameThread();
const storeCode = new URL("../../stores/strata/machine.ts", import.meta.url);
const next = await engine({ workers: runtime, count: inWorkers ? 4 : 2 });
const mounted = new Map<string, Store>();
for (const name of names) {
  const store = inWorkers
    ? await runtime.run<Store>(storeCode, { folder: join(folder, name) })
    : strata(folderStorage(join(folder, name)));
  await next.mount(name, store, { write: true });
  mounted.set(name, store);
}

const migrating = performance.now();
const { language, commits } = await migrate(next, mounted);
for (const { store, holons } of commits) console.log(`${store}: ${holons} holons written as uses`);
console.log(`migrated in ${Math.round(performance.now() - migrating)} ms`);

// An answer as JSON with records' keys in order, so two answers compare as text.
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => (a < b ? -1 : 1)))
      : inner,
  );

const refused = /refused|instead|is not read|is asked of a holon known/i;
let same = 0;
const differ: string[] = [];
const turnedAway: string[] = [];

for (const text of asked) {
  const read = await namesAsked(earlier.read, text)
    .then((names) => ({
      expression: parse(text, names),
      uses: toRead(syntax(text), { ...names, typeOf: (name) => language[name as keyof typeof language] }),
    }))
    .catch((error: Error) => error);
  if (read instanceof Error) {
    differ.push(text);
    console.log(`UNREAD          ${text}\n        ${read.message}`);
    continue;
  }
  const was = await earlier.read({ value: read.expression }).then(
    (value) => ({ value }),
    (error: Error) => ({ problem: error.message }),
  );

  const from = performance.now();
  const answer = await next.read(read.uses);
  const ms = Math.round(performance.now() - from);
  const now: { value: unknown } | { problem: string } =
    "value" in answer ? { value: answer.value } : { problem: answer.problem };

  if (canonical(was) === canonical(now)) {
    same++;
    console.log(`same    ${String(ms).padStart(5)} ms  ${text}`);
  } else if ("problem" in now && refused.test(now.problem) && "value" in was) {
    turnedAway.push(text);
    console.log(`refused ${String(ms).padStart(5)} ms  ${text}\n        ${now.problem}`);
  } else if (text in otherwise) {
    console.log(`apart   ${String(ms).padStart(5)} ms  ${text}\n        ${otherwise[text]}`);
  } else {
    differ.push(text);
    console.log(`DIFFERS ${String(ms).padStart(5)} ms  ${text}`);
    console.log(`  was ${canonical(was).slice(0, 400)}`);
    console.log(`  now ${canonical(now).slice(0, 400)}`);
  }
  if (answer.diverged?.length) console.log(`        diverged: ${answer.diverged.join(", ")}`);
}

console.log(`\n${same} the same, ${turnedAway.length} refused by the new engine, ${differ.length} differ`);
for (const name of names) await next.unmount(name);
if (!given) rmSync(folder, { recursive: true, force: true });
process.exit(differ.length ? 1 : 0);
