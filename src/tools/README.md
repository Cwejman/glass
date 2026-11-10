# Tools over the store

The store is blocks and a log, and these read from it and add to it. `src/store/vectors/README.md` is the format. Run them from the repository root.

- `ask.ts`: reads the field through the engine, as the browser does: every store on this machine attached to a local engine, one expression in the language asked of it, and the answer shown, prose as prose and a holon as its id, name and type. The language is at the top of `src/language/text.ts`; the functions are in `src/field/functions.json`. This is the one way an agent reads; the probe and the read tool that read the blocks beside it were retired for it on 2026-11-10, and are in git's history.
  `bun src/tools/ask.ts 'level(store("main")) | map(h => {name: h.name, tokens: measure(h)})'` the roots, measured
  `bun src/tools/ask.ts 'outline(@"The wiki", 3)'` a whole's structure without its prose
  `bun src/tools/ask.ts 'text(@Glass/"The grounds")'` a brief as prose, found by a route
  `--json` for the engine's answer as it is, `--all` for every one of a long list, `--file <path>` for an expression kept in a file.

