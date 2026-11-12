// Asks the field an expression, through an engine, as the browser does: the stores this
// repository holds attached to a local engine, the text read into the expression it says,
// and what the engine answers shown. This is how an agent reads the field.
//
// Usage: bun engine/ask.ts '<expression>' [--json]
//        bun engine/ask.ts --file <path.expr> [--json]
//
//   bun engine/ask.ts 'text(@"The wiki")'
//   bun engine/ask.ts 'type(@types/measure) | filter(m => eq(m.value, 3)) | size'
//
// A string comes back as it is, so prose reads as prose. A holon is shown as its id,
// its name and what it is, one to a line where there are many; anything else as JSON,
// a holon within it as its id and name. A list is cut after a hundred, saying how many
// it holds; --all shows every one, and --json gives the value as the engine does; --git
// attaches this repository's history, read through git, as the store git.

import { readFileSync } from "node:fs";
import type { Engine } from "./compat.ts";
import { localEngine } from "./local.ts";
import { isRef } from "./moulds.ts";
import type { Value } from "./compat.ts";
import { namesAsked } from "../language/names.ts";
import { parse } from "../language/text.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const fileAt = args.indexOf("--file");
const text =
  fileAt >= 0 ? readFileSync(args[fileAt + 1]!, "utf8") : args.find((arg) => !arg.startsWith("--"));

if (!text) {
  console.error("usage: bun engine/ask.ts '<expression>' [--json], or --file <path> [--json]");
  process.exit(1);
}

// The engine here, every store the repository holds attached as itself, and this
// repository's own history, read through git, where asked.
const engineHere = () => localEngine({ git: flag("--git") });

// A holon as one line: its id, its name, and what it is.
async function said(engine: Engine, id: string) {
  const holon = await engine.read({ holon: id });
  if (!holon) return `@${id} (not in the field)`;

  return [
    `@${id}`,
    holon.name !== undefined ? JSON.stringify(holon.name) : "",
    holon.types.length ? `(${holon.types.join(", ")})` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

// A list longer than this is cut, and says how many it holds, unless --all is asked.
const cut = flag("--all") ? Number.POSITIVE_INFINITY : 100;

async function shown(engine: Engine, value: Value): Promise<string> {
  if (typeof value === "string") return value;
  if (isRef(value)) return said(engine, value.$ref);
  if (Array.isArray(value) && value.length === 0) return "(nothing)";

  if (Array.isArray(value) && value.length > cut) {
    const rest = value.length - cut;
    return `${await shown(engine, value.slice(0, cut))}\n… and ${rest} more, ${value.length} in all (--all shows every one)`;
  }

  if (Array.isArray(value) && value.every((each) => isRef(each) || typeof each === "string"))
    return (await Promise.all(value.map((each) => shown(engine, each)))).join("\n");

  const names = new Map<string, string>();

  const gather = async (inner: unknown): Promise<void> => {
    if (isRef(inner)) names.set(inner.$ref, await said(engine, inner.$ref));
    else if (Array.isArray(inner)) for (const each of inner) await gather(each);
    else if (typeof inner === "object" && inner !== null)
      for (const each of Object.values(inner)) await gather(each);
  };

  await gather(value);

  return JSON.stringify(value, (_key, inner) => (isRef(inner) ? names.get(inner.$ref) : inner), 2);
}

const engine = await engineHere();

try {
  const expression = parse(text, await namesAsked(engine.read, text));
  const value = await engine.read({ value: expression });

  console.log(flag("--json") ? JSON.stringify(value, null, 2) : await shown(engine, value));
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
