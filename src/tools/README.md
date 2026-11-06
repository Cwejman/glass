# Tools for the branches

Scripts this session used to write and read the shared branches. Run them from the repository root.

- `append.ts`: appends one utterance of the author's to `session.json`. Every existing id is kept. New lexemes go into `lexicon.json`, and new or edited paths come from an optional patch file.
  `bun src/tools/append.ts "$PWD" <utterance.txt> <typed|spoken> [paths.json]`
  In the text, `{typed|meant}` marks a correction, and `_` inside the braces stands for a space.
- `union.ts`: rewrites `union.json` over every store. It keeps the union's own ids and any store entries another session added, then checks that every reference resolves.
  `bun src/tools/union.ts`
- `slices.ts`: cuts the union into the commits it would be born in, writes `slices.json`, and prints the measure. The rule: a slice is declared by its roots, in the order things came, and packs every holon its roots hold that no earlier slice has packed. It never reaches into a holon that roots a later slice, and it brings along the lexemes its words are the first to say. Types all go in the first slice.
  `bun src/tools/slices.ts`
