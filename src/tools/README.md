# Tools for the branches

Scripts this session used to write and read the shared branches. Run them from the repository root.

- `append.ts`: appends one utterance of the author's to `session.json`. Every existing id is kept. New lexemes go into `lexicon.json`, and new or edited paths come from an optional patch file.
  `bun src/tools/append.ts "$PWD" <utterance.txt> <typed|spoken> [paths.json]`
  In the text, `{typed|meant}` marks a correction, and `_` inside the braces stands for a space.
- `union.ts`: rewrites `union.json` over every store. It keeps the union's own ids and any store entries another session added, then checks that every reference resolves.
  `bun src/tools/union.ts`
- `slices.ts`: cuts the union into the commits it would be born in, writes `slices.json`, and prints the measure. The rule: a slice is declared by its roots, in the order things came, and packs every holon its roots hold that no earlier slice has packed. It never reaches into a holon that roots a later slice, and it brings along the lexemes its words are the first to say. Types all go in the first slice.
  `bun src/tools/slices.ts`
- `pack.ts`: births the store as packs, one commit per slice. `store/packs/<hash>.pack` holds the objects a commit adds, one canonical JSON per line. `<hash>.idx` gives each object's byte offset and length in it. `store/refs/main` is `"<commit> <pack>"`. A version keeps the name and the mould beside the body, and the index tree is keyed by the start of each id, its moment of birth. The paper's slices become a store of their own in `store/paper/`, kept local by its licence. Run it again after `slices.ts` whenever the holons change.
  `bun src/tools/pack.ts`
- `read-packs.ts`: reads a store back from its packs alone, as a client on a static host would. It starts from the ref, follows the commit chain, fetches each object by byte range, checks it against its name, and compares every holon with its source.
  `bun src/tools/read-packs.ts store`
