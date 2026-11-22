import { expect, test } from "bun:test";
import { idAt, nextId } from "../stores/ids.ts";
import type { Holon } from "../stores/store.ts";
import { lifted, markedOf, markedWriter, proseWriter, sentencesOf, type Run } from "./prose.ts";

const type = (id: string, name: string): Holon => ({ id, instance: [], name, mould: {}, body: {} });

function writer() {
  const types = ["sentence", "paragraph", "break", "item", "link"];
  const holons: Holon[] = types.map((name, i) => type(`T${i}`, name));

  let next = idAt(1_800_000_000_000);

  const mint = () => {
    const id = next;
    next = nextId(id);
    return id;
  };

  const prose = proseWriter(holons, mint);
  const byId = (id: string) => prose.born.find((holon) => holon.id === id)!;
  const typeOf = (id: string) => holons.find(({ id: typeId }) => typeId === byId(id)?.instance[0])?.name;

  return { prose, marked: markedWriter(prose), byId, typeOf };
}

test("an utterance keeps its words as text, and a correction what was typed", () => {
  const { prose, byId } = writer();
  const [paragraph] = prose.flow("A {teh|the} word, here.");

  expect(byId(paragraph!).body).toEqual({ text: ["A the word, here."], typed: "A teh word, here." });
});

test("a mark in an utterance stays the author's text, escaped", () => {
  const { prose, byId } = writer();
  const [paragraph] = prose.flow("A *star* here.");

  expect(byId(paragraph!).body.text).toEqual(["A \\*star\\* here."]);
});

test("marked prose keeps its marks as text, and a link into the field a holon", () => {
  const { marked, byId, typeOf } = writer();
  const target = "1M6YBY3G0000TQA";
  const paragraph = byId(
    marked.paragraph(
      `Plain \`code here\` and [a link](${target}), **strong words** and [the web](https://example.com).`,
    ),
  );
  const [before, link, after] = paragraph.body.text as Run[];

  expect(before).toBe("Plain `code here` and ");
  expect(typeOf((link as { $ref: string }).$ref)).toBe("link");
  expect(byId((link as { $ref: string }).$ref).body).toEqual({ text: ["a link"], leads: { $ref: target } });
  expect(after).toBe(", **strong words** and [the web](https://example.com).");
  expect(markedOf(paragraph.body.text, byId, typeOf)).toBe(
    `Plain \`code here\` and [a link](${target}), **strong words** and [the web](https://example.com).`,
  );
});

test("a sentence does not end inside a mark", () => {
  const { marked, byId } = writer();
  const paragraph = byId(marked.paragraph("One `a. b` still one. And two."));

  expect(sentencesOf(paragraph.body.text, () => "").map(({ text }) => text)).toEqual([
    "One `a. b` still one.",
    "And two.",
  ]);
});

test("a sentence is lifted out of its paragraph where something points at it, in its place", () => {
  const { prose, marked, byId, typeOf } = writer();
  const paragraph = byId(marked.paragraph("First, said. Then [this](1M6YBY3G0000TQA) is pointed at. Last."));
  const textOf = (id: string) => markedOf(byId(id).body.text, byId, typeOf);
  const [, second] = sentencesOf(paragraph.body.text, textOf);

  const runs = lifted(paragraph.body.text, second!, (inner) => prose.put("sentence", { text: inner }));
  const sentence = runs.find(
    (run): run is { $ref: string; $holds: true } =>
      typeof run !== "string" && typeOf(run.$ref) === "sentence",
  )!;

  expect(markedOf(runs, byId, typeOf)).toBe(markedOf(paragraph.body.text, byId, typeOf));
  expect(markedOf(byId(sentence.$ref).body.text, byId, typeOf)).toBe(
    "Then [this](1M6YBY3G0000TQA) is pointed at.",
  );
});

test("a paragraph said again lifts again a sentence whose text still stands, keeping its holon", () => {
  const { marked, byId } = writer();
  const kept = "1M6YBY3G0000AAA";
  const again = byId(
    marked.paragraphKeeping("Changed first. Kept as it was.", new Map([["Kept as it was.", kept]])),
  );

  expect(again.body.text).toEqual(["Changed first. ", { $ref: kept, $holds: true }]);
  expect([...marked.still]).toEqual([kept]);
});

test("nothing is written beside the text: no words, no lexicon", () => {
  const { prose } = writer();

  prose.flow("Word word WORD.");

  expect(prose.born.length).toBe(1);
});
