// The bar the rewrite is held to: what the engine costs, asked through its surface
// alone, so the same questions time the engine as it is and as it becomes. Each is
// asked once, in order, on an engine started fresh, so the first pays for the reading.
//
// Usage: bun engine/measure.ts

import { localEngine } from "./serve/local.ts";
import { namesAsked } from "../language/names.ts";
import { parse } from "../language/text.ts";

const ms = (from: number) => `${Math.round(performance.now() - from)} ms`.padStart(8);

let at = performance.now();
const engine = await localEngine();
console.log(`${ms(at)}  stores opened and mounted`);

const ask = async (what: string, text: string) => {
  const expression = parse(text, await namesAsked(engine.read, text));
  const from = performance.now();
  await engine.read({ value: expression });
  console.log(`${ms(from)}  ${what}`);
};

at = performance.now();
const root = (await engine.read({ value: parse("@main:main", await namesAsked(engine.read, "@main:main")) })) as {
  $ref: string;
};
console.log(`${ms(at)}  a name resolved, the field first read whole`);

at = performance.now();
await engine.read({ holon: root.$ref });
console.log(`${ms(at)}  one holon by id, cold`);

await ask("a question over the field", "type(@main:types/brief) | size");
await ask("the same, again", "type(@main:types/brief) | size");
await ask("a pattern, its index first built", `find(?m, [?m, "instance", @main:types/measure], [?m, "value", 3])`);
await ask("the text of the wiki", `text(@"The wiki")`);
await ask("an outline of the wiki", `outline(@"The wiki", 3)`);
await ask("a store's history", `log("main") | size`);
