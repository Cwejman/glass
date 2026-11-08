# Tools over the store

The store is blocks and a log, and these read from it and add to it. `vectors/README.md` is the format. Run them from the repository root.

- `probe.ts`: charts the field before any of it is read, so a session or the author can choose what to digest. It starts at the roots, the holons nothing holds, and goes down by holdings only, as declared on the reference or by the mould; everything else is a pointing, charted across. A route is a path from the roots, `4.1.7`, and may end in a run of siblings, `9.1.33-40`; it is counted within its scope, so it is read with the scope it was charted in. The scope is stated by store: `--without paper,paper-readings` or `--only main`. Measures are in tokens, estimated from words and from prose kept as strings, each holon counted once.
  `bun src/tools/probe.ts --without paper,paper-readings` the roots, measured
  `bun src/tools/probe.ts --without paper,paper-readings --digest 4000` the field cut into pieces to read, each a route
  `bun src/tools/probe.ts 9.1.33-40 --without paper,paper-readings --text` one piece, as prose
  `bun src/tools/probe.ts 4 --without paper,paper-readings --depths` a whole layer by layer, to the bottom; `--points` its pointings in and out; `--layer n`, `--type t`, or both, a slice across; `--layers n` unfolds the tree
- `blocks.ts`: the store as blocks. `open(dir)` reads a store from its ref and open volume, and fetches any block whole, checked by its hash. `holons()` is the latest field, `get(id)` one holon, and `versions(id)`, `history()` and `fieldAt(n)` what came before, read only when asked. `mint()` gives a commit's new names. `commit(store, holons, says)` adds one commit, a new version of each holon given, and can take holons out of the field; nothing written before is touched. `land(store, otherDir)` brings a copy's commits onto this one, changing no block, and stops if both changed one holon. `field()` reads every store under `store/` as one.
- `read.ts`: draws any holon as text from the blocks.
  `bun src/tools/read.ts <name | id | wiki path> [depth]`. A name may be given by its start; one that several holons carry lists them, each with its id.
- `convert.ts`: the one conversion from packs, kept to show how it was proved. It reads packs itself, so it needs a checkout from before it.
- `append.ts`: adds one utterance of the author's to the session as one commit. New words bring new lexemes; paths are added or edited from an optional patch file.
  `bun src/tools/append.ts <utterance.txt> <typed|spoken> [paths.json]`
  In the text, `{typed|meant}` marks a correction, and `_` inside the braces stands for a space.
