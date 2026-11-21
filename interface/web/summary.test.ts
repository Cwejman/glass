import { describe, expect, test } from "bun:test";
import { countsOf, ledeOf, modeFor, sharedKeys, summaryOf, titleOf, type Said } from "./summary.ts";

const ref = (id: string) => ({ $ref: id });
const refs = (n: number) => Array.from({ length: n }, (_, i) => ref(`h${i}`));

describe("a holon said compactly", () => {
  test("a brief says its first paragraph, read already, before anything else", () => {
    const brief: Said = {
      name: "Knowledge",
      types: ["brief"],
      store: "main",
      body: { prose: [ref("p1")], says: "x" },
    };
    expect(ledeOf(brief)).toBe("p1");
    expect(summaryOf(brief, "b", "Glass is an operating system.")).toEqual({
      title: "Knowledge",
      says: "Glass is an operating system.",
      kind: "brief · in main",
    });
    // An utterance's flow opens with a paragraph as well.
    expect(ledeOf({ types: ["utterance"], body: { flow: [ref("p2")] } })).toBe("p2");
  });

  test("then what it says, then its text, then how many of each it holds", () => {
    expect(
      summaryOf({ name: "shape", types: ["type"], store: "glass", body: { says: "What a field is." } }, "s")
        .says,
    ).toBe("What a field is.");
    expect(summaryOf({ name: "First", types: [], body: { text: "Glass holds holons" } }, "f").says).toBe(
      "Glass holds holons",
    );
    expect(
      summaryOf({ name: "lexicon", types: ["lexicon"], store: "main", body: { lexemes: refs(4486) } }, "l"),
    ).toEqual({
      title: "lexicon",
      says: "4,486 lexemes",
      kind: "lexicon · in main",
    });
    expect(countsOf({ contents: refs(11), dependencies: refs(1), shape: ref("s") })).toBe(
      "11 held · 1 dependency",
    );
    expect(summaryOf({ name: "main", types: ["store"], store: "main", body: {} }, "m")).toEqual({
      title: "main",
      kind: "store",
    });
  });

  test("one with no name is called by its short text, else by what it is", () => {
    const lexeme: Said = { types: ["lexeme"], store: "main", body: { text: "consultant" } };
    expect(summaryOf(lexeme, "x")).toEqual({ title: "consultant", kind: "lexeme · in main" });
    expect(titleOf({ types: ["utterance"], body: {} }, "u")).toBe("an utterance");
    expect(titleOf({ types: ["paragraph"], body: { text: "a\nb" } }, "p")).toBe("a paragraph");
    expect(titleOf(undefined, "ID")).toBe("@ID");
  });

  test("a table is offered by the keys most of the holons keep; few are cards, many rows", () => {
    const kept = (body: Said["body"]): Said => ({ types: [], body });
    expect(sharedKeys([kept({ a: 1, b: 2 }), kept({ a: 3 }), kept({ a: 4, c: refs(9) })])).toEqual(["a"]);
    expect(sharedKeys([kept({ a: 1 })])).toEqual([]);
    expect(modeFor(11)).toBe("cards");
    expect(modeFor(4486)).toBe("rows");
  });
});
