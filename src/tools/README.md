# Tools over the store

The store is packs, and these read from it and add to it. Run them from the repository root.

- `probe.ts`: charts the field before any of it is read, so a session or the author can choose what to digest. It starts at the roots, the holons nothing holds, and goes down by holdings only, as declared on the reference or by the mould; everything else is a pointing, charted across. A route is a path from the roots, `4.1.7`, and may end in a run of siblings, `9.1.33-40`; it is counted within its scope, so it is read with the scope it was charted in. The scope is stated by store: `--without paper,paper-readings` or `--only main`. Measures are in tokens, estimated from words and from prose kept as strings, each holon counted once.
  `bun src/tools/probe.ts --without paper,paper-readings` the roots, measured
  `bun src/tools/probe.ts --without paper,paper-readings --digest 4000` the field cut into pieces to read, each a route
  `bun src/tools/probe.ts 9.1.33-40 --without paper,paper-readings --text` one piece, as prose
  `bun src/tools/probe.ts 4 --without paper,paper-readings --depths` a whole layer by layer, to the bottom; `--points` its pointings in and out; `--layer n`, `--type t`, or both, a slice across; `--layers n` unfolds the tree
- `packs.ts`: the store as packs. `open(dir)` reads a store from its ref, following each commit's parent and parent pack, and fetches any object by byte range, checked by its name. Each pack is mapped into memory once and every object checked against its name before it is parsed, with nothing in the read path waiting: the whole field loads in under a second. `commit(store, holons, says)` adds one commit as a diff-pack: a new version of each holon given, pointing back at the one before, the index tree grown only where it changed, and one new pack with its index. Nothing written before is touched. `field()` reads every store under `store/` as one: the main store, the paper, and its readings. `commit` also takes holons out of a store's field, their versions kept in the packs before.
- `read.ts`: draws any holon as text from the packs.
  `bun src/tools/read.ts <name | id | wiki path> [depth]`. A name may be given by its start; one that several holons carry lists them, each with its id.
- `append.ts`: adds one utterance of the author's to the session as one commit. New words bring new lexemes; paths are added or edited from an optional patch file.
  `bun src/tools/append.ts <utterance.txt> <typed|spoken> [paths.json]`
  In the text, `{typed|meant}` marks a correction, and `_` inside the braces stands for a space.
