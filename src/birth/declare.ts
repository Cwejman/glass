import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Connector, Connectors, Shape } from "../engine/types.ts";

// The bodies of the field's types, written as TypeScript for the components
// to draw with: each type an interface named for its body, as BriefBody, so
// no name of TypeScript's own is shadowed, each of its fields a property, with
// what the field means, said in prose, as the property's comment. Made from
// the types themselves, so a component knows a body by what its type
// declares and never by guessing; and each component's settings, made from
// what it declares the same way. `declarations` gives the text, and run as
// a program it writes it beside the components.

const repo = join(import.meta.dir, "../..");
export const declared = join(repo, "src/field/components/bodies.ts");

export async function declarations(): Promise<string> {
  const files = (await readdir(join(repo, "src/field/types"))).filter((file) => file.endsWith(".json")).sort();
  const types = await Promise.all(
    files.map(async (file) => JSON.parse(await readFile(join(repo, "src/field/types", file), "utf8"))),
  );
  const files_ = (await readdir(join(repo, "src/field/components")))
    .filter((file) => file.endsWith(".tsx"))
    .sort();
  const modules = await Promise.all(files_.map((file) => import(join(repo, "src/field/components", file))));
  const components = modules
    .filter((module) => module.declared)
    .map((module) => module.declared as { title: string; settings?: Connectors });

  return [
    "// The bodies of the field's types, made from the types by `bun run declare`.",
    "// Never written by hand: change a type, and declare again.",
    "",
    'import type { Json } from "../../store/canonical.ts";',
    'import type { Expression } from "../../engine/engine.ts";',
    "",
    "// A reference to a holon, pinned to one version where it says so.",
    'export type Ref = { $ref: string; "@"?: string };',

    ...types.flatMap(({ title, says, fields }) => [
      "",
      comment(says, ""),
      `export interface ${identifier(title)}Body ${block(fields, "")}`,
    ]),
    ...components
      .filter(({ settings }) => settings)
      .flatMap(({ title, settings }) => [
        "",
        comment(`The settings the ${title} component takes from the slot that opens it.`, ""),
        `export interface ${identifier(title)}Settings ${block(settings!, "")}`,
      ]),
    "",
  ].join("\n");
}

function block(connectors: Connectors, indent: string): string {
  const lines = Object.entries(connectors).flatMap(([key, connector]) => [
    comment(connector.says, `${indent}  `),
    `${indent}  ${property(key)}${connector.optional ? "?" : ""}: ${typeOf(connector, `${indent}  `)};`,
  ]);
  return `{\n${lines.join("\n")}\n${indent}}`;
}

function typeOf({ shape }: Connector, indent: string): string {
  return shapeType(shape, indent);
}

// A type's title as a name TypeScript can hold, its words run together; a
// key as a property, quoted where it is not a plain name.
const identifier = (title: string) =>
  title
    .replace(/[^A-Za-z0-9]+(.)?/g, (_, next: string | undefined) => next?.toUpperCase() ?? "")
    .replace(/^[^A-Za-z_]/, "_$&");
const property = (key: string) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key));

const shapeTypes: Record<string, string> = {
  string: "string",
  markdown: "string",
  number: "number",
  boolean: "boolean",
  ref: "Ref",
  expression: "Expression",
  connectors: "Json",
  json: "Json",
};

function shapeType(shape: Shape, indent: string): string {
  if (typeof shape === "string") {
    if (!Object.hasOwn(shapeTypes, shape)) throw new Error(`no type is declared for the shape ${shape}`);
    return shapeTypes[shape]!;
  }
  if ("list" in shape) return `${shapeType(shape.list, indent)}[]`;
  return block(shape.fields, indent);
}

const comment = (says: string, indent: string) => `${indent}/** ${says.replace(/\*\//g, "* /")} */`;

if (import.meta.main) {
  await writeFile(declared, await declarations());
  console.log(`declared ${declared.slice(repo.length + 1)}`);
}
