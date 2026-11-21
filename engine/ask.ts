// Asks the field an expression, through an engine, as the browser does: the stores this
// repository holds mounted on the engine here (stores.ts), the text read into uses by
// the native parse, and what the engine answers shown. This is how an agent reads the
// field.
//
// Usage: bun engine/ask.ts '<expression>' [--json]
//        bun engine/ask.ts --file <path.expr> [--json]
//
//   bun engine/ask.ts 'text(@Knowledge)'
//   bun engine/ask.ts 'type(@author:types/measure) | filter(m => eq(m.value, 3)) | size'
//
// A string comes back as it is, so prose reads as prose. A holon is shown by its route,
// as @wiki:Knowledge, and what it is, one to a line where there are many; anything else
// as JSON, a holon within it by its route. A list is cut after a hundred, saying how many
// it holds; --all shows every one, and --json gives the value as the engine does.

import { readFileSync } from "node:fs";
import { applying, found, type Glass } from "../interface/web/carried.ts";
import { engineHere } from "../stores.ts";
import type { Engine, Read } from "./next/engine.ts";
import { isRef, type Value } from "./next/read/values.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const fileAt = args.indexOf("--file");
const text =
  fileAt >= 0 ? readFileSync(args[fileAt + 1]!, "utf8") : args.find((arg) => !arg.startsWith("--"));

if (!text) {
  console.error("usage: bun engine/ask.ts '<expression>' [--json], or --file <path> [--json]");
  process.exit(1);
}

// What a read gives, or its problem thrown.
async function valueOf(engine: Engine, read: Read): Promise<Value> {
  const answer = await engine.read(read);
  if ("problem" in answer) throw new Error(answer.problem);
  return answer.value;
}

// A holon as one line: its route, and what it is.
async function said(engine: Engine, glass: Glass, id: string) {
  const holon = (await valueOf(engine, applying(glass, "holon", { $ref: id }))) as {
    types?: string[];
  } | null;
  if (!holon) return `@${id} (not in the field)`;

  const route = await valueOf(engine, applying(glass, "print", { gives: { $ref: id } }));
  const types = holon.types ?? [];
  return [String(route), types.length ? `(${types.join(", ")})` : ""].filter(Boolean).join(" ");
}

// A list longer than this is cut, and says how many it holds, unless --all is asked.
const cut = flag("--all") ? Number.POSITIVE_INFINITY : 100;

async function shown(engine: Engine, glass: Glass, value: Value): Promise<string> {
  if (typeof value === "string") return value;
  if (isRef(value)) return said(engine, glass, value.$ref);
  if (Array.isArray(value) && value.length === 0) return "(nothing)";

  if (Array.isArray(value) && value.length > cut) {
    const rest = value.length - cut;
    return `${await shown(engine, glass, value.slice(0, cut))}\n… and ${rest} more, ${value.length} in all (--all shows every one)`;
  }

  if (Array.isArray(value) && value.every((each) => isRef(each) || typeof each === "string"))
    return (await Promise.all(value.map((each) => shown(engine, glass, each)))).join("\n");

  const names = new Map<string, string>();

  const gather = async (inner: unknown): Promise<void> => {
    if (isRef(inner)) names.set(inner.$ref, await said(engine, glass, inner.$ref));
    else if (Array.isArray(inner)) for (const each of inner) await gather(each);
    else if (typeof inner === "object" && inner !== null)
      for (const each of Object.values(inner)) await gather(each);
  };

  await gather(value);

  return JSON.stringify(value, (_key, inner) => (isRef(inner) ? names.get(inner.$ref) : inner), 2);
}

try {
  const engine = await engineHere();
  const glass = await found((read) => engine.read(read));
  const read = (await valueOf(engine, applying(glass, "parse", text))) as unknown as Read;
  const value = await valueOf(engine, read);

  console.log(flag("--json") ? JSON.stringify(value, null, 2) : await shown(engine, glass, value));
  process.exit(0);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
