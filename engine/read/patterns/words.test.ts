// One tokeniser for everything that reads words: what is matched and what is asked are
// cut the same way.

import { expect, test } from "bun:test";
import { wordsOf } from "./words.ts";

test("words are cut where no letter or number stands, and lower cased", () => {
  expect(wordsOf("Glass, the engine (and patterns).")).toEqual(["glass", "the", "engine", "and", "patterns"]);
});

test("an apostrophe within a word keeps it whole, and a possessive is folded", () => {
  expect(wordsOf("You're the author's, don’t")).toEqual(["you're", "the", "author", "don't"]);
});

test("an accent is folded, a letter of its own kept, and every script's marks kept", () => {
  expect(wordsOf("Café résumé")).toEqual(["cafe", "resume"]);
  expect(wordsOf("Får Åre för")).toEqual(["får", "åre", "för"]);
  expect(wordsOf("नमस्ते データ 한국어")).toEqual(["नमस्ते", "データ", "한국어"]);
});

test("what is no text gives no words", () => {
  expect(wordsOf(3)).toEqual([]);
  expect(wordsOf(null)).toEqual([]);
});
