import { expect, test } from "bun:test";
import { newId } from "../store/id.ts";
import { wiki } from "./holons.ts";
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
