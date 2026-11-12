// The words of a text, as a word said in a pattern cuts them, the index keeps them and
// the language's words gives them. A word is a run of letters and numbers, an apostrophe
// within it kept, cut wherever anything else stands, as full text search's unicode61
// cuts: so a hyphen, a slash or the comma in 70,000 parts words, and an emoji is none.
// Lower cased; a Latin letter's accent folded, so café is cafe, while what is a letter of
// its own, as å or ö in Swedish, and every other script's marks are kept; a possessive's
// 's let go. A search, contains and named still part what they are given at its spaces
// and find each part within what is said, as they did before.

const word = /[\p{L}\p{N}\p{M}]+(?:['’][\p{L}\p{N}\p{M}]+)*/gu;

// Letters only accented, not letters of their own, folded to the letter beneath.
const accentsFolded = (text: string) =>
  text
    .normalize("NFD")
    .replace(/(?<=[a-zA-Z])[\u0300-\u0302\u0303\u0304\u0306\u0307\u0309\u030b\u030c\u0327\u0328]/g, "")
    .normalize("NFC");

export function wordsOf(text: unknown): string[] {
  if (typeof text !== "string") return [];

  return (
    accentsFolded(text)
      .toLowerCase()
      .match(word)
      ?.map((each) => each.replace(/’/g, "'").replace(/'s$/, "")) ?? []
  );
}
