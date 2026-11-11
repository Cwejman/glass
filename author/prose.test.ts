import { expect, test } from "bun:test";
import { idAt, nextId, type Holon } from "../integrations/glass/store.ts";
import { markedWriter, proseWriter } from "./prose.ts";

const type = (id: string, name: string): Holon => ({ id, instance: [], name, mould: {}, body: {} });

function writer() {
  const types = [
    "lexicon",
    "lexeme",
    "word",
    "sentence",
    "paragraph",
    "break",
    "item",
    "link",
    "codespan",
    "strong",
    "emphasis",
  ];
  const holons: Holon[] = types.map((name, i) => type(`T${i}`, name));

  holons.push({ id: "L", instance: ["T0"], name: "lexicon", body: { lexemes: [] } });

  let next = idAt(1_800_000_000_000);

  const mint = () => {
    const id = next;
    next = nextId(id);
    return id;
  };

  const prose = proseWriter(holons, mint);
  const byId = (id: string) => prose.born.find((holon) => holon.id === id)!;
  const typeOf = (holon: Holon) => holons.find(({ id }) => id === holon.instance[0])!.name;

  return { prose, marked: markedWriter(prose), byId, typeOf };
}

const ids = (list: { $ref: string }[]) => list.map(({ $ref }) => $ref);

test("an utterance keeps its words, and a correction what was typed", () => {
  const { prose, byId } = writer();
  const [paragraph] = prose.flow("A {teh|the} word, here.");
  const [sentence] = ids(byId(paragraph!).body.sentences);
  const words = ids(byId(sentence!).body.words).map(byId);

  expect(words.map(({ body }) => body.text)).toEqual(["A", "the", "word", "here"]);
  expect(words[1]!.body.typed).toBe("teh");
  expect(words[2]!.body.after).toBe(",");
});

test("asterisks in an utterance stay words", () => {
  const { prose, byId } = writer();
  const [paragraph] = prose.flow("A *star* here.");
  const [sentence] = ids(byId(paragraph!).body.sentences);

  const words = ids(byId(sentence!).body.words).map(byId);

  expect(words.map(({ body }) => body.text)).toEqual(["A", "star", "here"]);
  expect(words[1]!.body.before).toBe("*");
});

test("marked prose makes its marks holons, nested", () => {
  const { marked, byId, typeOf } = writer();
  const target = "1M6YBY3G0000TQA";
  const paragraph = byId(
    marked.paragraph(
      `Plain \`code here\` and [a link](${target}), **strong words** and [the web](https://example.com).`,
    ),
  );
  const [sentence] = ids(paragraph.body.sentences);
  const inline = ids(byId(sentence!).body.words).map(byId);

  expect(inline.map(typeOf)).toEqual([
    "word",
    "codespan",
    "word",
    "link",
    "word",
    "strong",
    "word",
    "link",
    "word",
  ]);
  expect(inline[1]!.body.text).toBe("code here");
  expect(inline[3]!.body.leads).toEqual({ $ref: target });
  expect(inline[7]!.body.to).toBe("https://example.com");
  expect(ids(inline[5]!.body.words).map((id) => byId(id).body.text)).toEqual(["strong", "words"]);
});

test("a sentence does not end inside a mark", () => {
  const { marked, byId } = writer();
  const paragraph = byId(marked.paragraph("One `a. b` still one. And two."));

  expect(paragraph.body.sentences.length).toBe(2);
});

test("a paragraph wholly marked keeps its links", () => {
  const { marked, byId, typeOf } = writer();
  const paragraph = byId(marked.paragraph("*Said, in [the store](1M6YBY3G0000TQA).*"));
  const [sentence] = ids(paragraph.body.sentences);
  const [emphasis] = ids(byId(sentence!).body.words).map(byId);

  expect(typeOf(emphasis!)).toBe("emphasis");
  expect(ids(emphasis!.body.words).map(byId).map(typeOf)).toContain("link");
});

test("new words bring new lexemes, once", () => {
  const { prose } = writer();

  prose.flow("Word word WORD.");

  expect(prose.lexiconGrew()).toBe(true);
  expect(prose.lexicon.body.lexemes.length).toBe(1);
});
