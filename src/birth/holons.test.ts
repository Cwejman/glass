import { expect, test } from "bun:test";
import { newId } from "../store/id.ts";
import { components, entry, expressions, wiki } from "./holons.ts";
import { parseFile } from "./wiki.ts";

const typeOf = { brief: newId() };
const ids = new Map<string, string>();
const idOf = (from: string) => {
  if (!ids.has(from)) ids.set(from, newId());
  return ids.get(from)!;
};

test("a wiki becomes holons: files and headings as briefs, links as references", () => {
  const files = new Map([
    ["README.md", parseFile("README.md", "# Glass\n\nThe face.\n\n[The store](architecture/store.md)\n")],
    [
      "architecture/store.md",
      parseFile(
        "architecture/store.md",
        "# The store\n\nSee [its index](#2-the-index).\n\n## 1. Objects\n\nNamed.\n\n## 2. The index\n\nWhole.\n",
      ),
    ],
  ]);
  const born = wiki(files, "README.md", idOf, typeOf);
  const by = (from: string) => born.holons.find((holon) => holon.body.from === from)!;

  expect(born.names.wiki).toBe(idOf("README.md"));
  expect(by("README.md").body.prose).toBe(`The face.\n\n[The store](ref:${idOf("architecture/store.md")})`);
  expect(by("architecture/store.md").body.prose).toBe(
    `See [its index](ref:${idOf("architecture/store.md#2-the-index")}).`,
  );
  expect(by("architecture/store.md").body.parts).toEqual([
    { $ref: idOf("architecture/store.md#1-objects") },
    { $ref: idOf("architecture/store.md#2-the-index") },
  ]);
  expect(born.holons.map((holon) => holon.instance)).toEqual(born.holons.map(() => [typeOf.brief]));
});

test("a link that leads nowhere is refused", () => {
  const files = new Map([
    ["README.md", parseFile("README.md", "# Glass\n\n[Gone](gone.md) and [no](#nowhere).\n")],
  ]);
  expect(() => wiki(files, "README.md", idOf, typeOf)).toThrow("links that lead nowhere");
});

test("the entry is a mount: a component and its argument, each named in the files resolved to a holon", () => {
  const typeOf = { mount: newId(), expression: newId(), component: newId(), brief: newId() };
  const looks = expressions(
    [{ name: "briefs", title: "Every brief", gathers: { instances: "brief" } }],
    idOf,
    typeOf,
  );
  const briefs = looks.names.briefs!;
  expect(looks.holons[0]!.body.gathers).toEqual({ instances: { $ref: typeOf.brief } });
  expect(looks.holons[0]!.instance).toEqual([typeOf.expression]);

  const reader = newId();
  const born = entry(
    { title: "The root", component: "Reader", argument: ["briefs"] },
    idOf,
    typeOf,
    {
      ...looks.names,
    },
    { Reader: reader },
  );
  const root = born.holons[0]!;
  expect(born.names.entry).toBe(root.id);
  expect(root.instance).toEqual([typeOf.mount]);
  expect(root.body.component).toEqual({ $ref: reader });
  expect(root.body.argument).toEqual([{ $ref: briefs }]);
  expect(() => entry({ title: "x", argument: ["nothing"] }, idOf, typeOf, {}, {})).toThrow("does not name");
});

test("a component as data: its template's mounts kept as they are, `$` the argument it is given", () => {
  const typeOf = { component: newId(), brief: newId() };
  const kindOf = { full: newId(), face: newId() };
  const born = components(
    [
      {
        from: "field/components/reader.json",
        title: "Reader",
        says: "What you look at.",
        takes: [],
        kinds: ["full"],
        argument: "selection",
        template: [{ argument: "$", kind: "face" }, { argument: "$" }],
      },
    ],
    idOf,
    typeOf,
    kindOf,
  );
  const reader = born.holons[0]!.body;
  expect(reader.code).toBeUndefined();
  expect(reader.template).toEqual([{ argument: "$", kind: { $ref: kindOf.face } }, { argument: "$" }]);
});
