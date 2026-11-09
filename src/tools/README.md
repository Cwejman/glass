# Tools over the store

The store is blocks and a log, and these read from it and add to it. `src/store/vectors/README.md` is the format. Run them from the repository root.

- `probe.ts`: charts the field before any of it is read, so a session or the author can choose what to digest. It starts at the roots, the holons nothing holds, and goes down by holdings only, as declared on the reference or by the mould; everything else is a pointing, charted across. A route is a path from the roots, `4.1.7`, and may end in a run of siblings, `9.1.33-40`; it is counted within its scope, so it is read with the scope it was charted in. The scope is stated by store: `--only main` or `--only glass`. Measures are in tokens, estimated from words and from prose kept as strings, each holon counted once.
  `bun src/tools/probe.ts --only main` the roots, measured
  `bun src/tools/probe.ts --only main --digest 4000` the field cut into pieces to read, each a route
  `bun src/tools/probe.ts 9.1.33-40 --only main --text` one piece, as prose
  `bun src/tools/probe.ts 4 --only main --depths` a whole layer by layer, to the bottom; `--points` its pointings in and out; `--layer n`, `--type t`, or both, a slice across; `--layers n` unfolds the tree
- `stores.ts`: the stores on this machine, as folders: `open(dir)`, `field()`, and `storeFolders()`, each read through `src/store/`. `src/store/store.ts` holds what they do: reading, `commit` and `land`.
- `read.ts`: draws any holon as text from the blocks.
  `bun src/tools/read.ts <name | id | wiki path> [depth]`. A name may be given by its start; one that several holons carry lists them, each with its id.
- `prose.ts`: text into holons: a paragraph, its sentences, its words and their lexemes. `append.ts` and `session.ts` write through it.
- `session.ts`: adds a session kept in brief, as one commit, from a file of its utterances and paths.
- `rewrite.ts`: rewrites briefs from a patch file, as one commit: each flow said anew or kept by place, what it stops holding taken out of the field with its versions kept, and the stale marks it resolves. Ids stay, so links still lead there.
- `append.ts`: adds one utterance of the author's to the session as one commit. New words bring new lexemes; paths are added or edited from an optional patch file.
  `bun src/tools/append.ts <utterance.txt> <typed|spoken> [paths.json]`
  In the text, `{typed|meant}` marks a correction, and `_` inside the braces stands for a space.
