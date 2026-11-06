# Tools over the store

The store is packs, and these read from it and add to it. Run them from the repository root.

- `packs.ts`: the store as packs. `open(dir)` reads a store from its ref, following each commit's parent and parent pack, and fetches any object by byte range, checked by its name. `commit(store, holons, says)` adds one commit as a diff-pack: a new version of each holon given, pointing back at the one before, the index tree grown only where it changed, and one new pack with its index. Nothing written before is touched. `field()` reads `store/` and, where present, `store/paper/` as one.
- `read.ts`: draws any holon as text from the packs.
  `bun src/tools/read.ts <name | id | wiki path> [depth]`
- `append.ts`: adds one utterance of the author's to the session as one commit. New words bring new lexemes; paths are added or edited from an optional patch file.
  `bun src/tools/append.ts <utterance.txt> <typed|spoken> [paths.json]`
  In the text, `{typed|meant}` marks a correction, and `_` inside the braces stands for a space.
