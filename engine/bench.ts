// Times the same questions asked as expressions and as patterns, over the stores this
// repository holds, the index built first and timed apart, so what a pattern costs is
// seen whole.
// Usage: bun engine/bench.ts
import { openStores } from "../stores.ts";
import { fieldOf } from "./field.ts";
import { answeringOf, kernel } from "./kernel.ts";
import { namesIn } from "../language/names.ts";
import { parse } from "../language/text.ts";
const stores = Object.entries(await openStores()).map(([key, store]) => ({ key, store }));
const all = await fieldOf(stores).everything();
const names = namesIn(all);
let t = performance.now();
answeringOf(all);
console.log(`index built: ${Math.round(performance.now() - t)} ms`);
const time = (text: string) => {
  const k = kernel({ all });
  const e = parse(text, names);
  const t0 = performance.now();
  const v = k.evaluate(e);
  const ms = performance.now() - t0;
  return [ms, Array.isArray(v) ? v.length : v] as const;
};
const cases: [string, string, string][] = [
  [
    "measures graded 3",
    `type(@main:types/measure) | filter(m => eq(m.value, 3))`,
    `find(?m, [?m, "instance", @main:types/measure], [?m, "value", 3])`,
  ],
  [
    "briefs that are steps",
    `and(type(@main:types/brief), type(@main:types/step))`,
    `find(?b, [?b, "instance", @main:types/brief], [?b, "instance", @main:types/step])`,
  ],
  [
    "a store's level, its root, found among all it holds",
    `level(store("main"))`,
    `find(?h, [?h, "store", "main"], not([?w, "$holds", ?h], [?w, "store", "main"]))`,
  ],
  [
    "utterances in the author's voice",
    `type(@main:types/utterance) | filter(u => eq(u.voice, @"The author"))`,
    `find(?u, [?u, "voice", @"The author"], [?u, "instance", @main:types/utterance])`,
  ],
  [
    "sessions and their days",
    `type(@main:types/session) | map(s => {s: s, on: s.on})`,
    `find({s: ?s, on: ?on}, [?s, "instance", @main:types/session], [?s, "on", ?on])`,
  ],
];
for (const [what, expression, pattern] of cases) {
  const [a, n1] = time(expression);
  const [b, n2] = time(pattern);
  console.log(
    `${what.padEnd(34)} expression ${a.toFixed(1).padStart(7)} ms (${n1})   pattern ${b.toFixed(1).padStart(6)} ms (${n2})`,
  );
}
