# Glass

Glass puts data, programs, AI and interfaces in one place, as small whole pieces kept with their whole history. Since 2026-11-06 glass's knowledge lives in its store, as holons, not in markdown. This file is the one way in: it says how the store is laid out and how to read it.

The repository holds two things: `store/`, the holons, and `src/`, the code. Only the tooling that bun, tsc and prettier look for sits beside them.

## The store

Everything is a holon: `{id, instance, name?, mould?, body}`. The `id` is a ULID given at birth. `instance` is the type the holon is an instance of. A type is a holon with a `mould`, which says what its instances hold, field by field, each in prose. Inside a body, `{"$ref": id}` is a reference to another holon. A reference holds (makes the other a part) or only points, as the mould says, or as `$holds` on the reference itself says.

Each file in `store/` is one JSON array with one holon per line:

| File | What it holds |
|---|---|
| `union.json` | The way in: one holon that points at every store's roots and holds none. |
| `primitives.json` | The types. Read their moulds first. |
| `lexicon.json` | Every word as one: the lexemes that words point at. |
| `wiki.json` | The wiki that was markdown, to the word: briefs, paragraphs, sentences, words. Links are references. It includes the author's words before the store, a day to a brief, under the paths `said/2026-10-30.md` to `said/2026-11-06.md`. |
| `markdown.json` | Markdown's surface, kept apart: with the wiki it rebuilds each old file. |
| `session.json` | The author's words in the second session of 2026-11-06, utterance by utterance, and the paths of evolution noted beside them. |
| `fork-licence.json`, `fork-selection.json` | Two forks that met that session, each pointing at it. |
| `statistics.json` | Statistics declared as prose and expression, never stored, over proposed functions. |
| `slices.json` | The store cut into the commits it would be born in, each declared by its roots. |
| `paper/` | A paper on holonic systems, read in whole, with its licence as a holon. By that licence its holons, its reading and the readings drawn over it stay on the machine that made them; only the PDF, the licence and the types are kept in git. |

## How to read

Start at the union, then read whatever its roots lead to:

```
bun src/tools/read.ts union
bun src/tools/read.ts README.md 1          the old wiki's entry, a level down
bun src/tools/read.ts primitives.md        the primitives in prose
bun src/tools/read.ts said/2026-11-05.md 9 a day of the author's words
bun src/tools/read.ts 2026-11-06-second    the latest session and its paths
bun src/tools/read.ts session              any type, by its name
```

The text is drawn from the holons each time; none is stored. A word is `before + text + after`, a sentence is its words, and a paragraph is its sentences. The other tools, to append a session's words, rebuild the union and slice the store, are in `src/tools/`, with their README.

## The code

`src/` holds the store, the engine, the interface, the birth, the field it shipped (`src/field/`), the store's test vectors (`src/store/vectors/`), the page (`src/site/`) and the tools. `bun test`, `bun run check` and `bun run build` run from the root; the build writes the site into `site/`, which is output only and never kept.

## Where it stands

- **The holons are the source now.** The birth from markdown has ended. Any birth from here only adds diff-packs: one per commit, each holding only what that commit adds (see the path "The store packed, carried by git" in the session). No pack is written yet; `slices.json` is the plan.
- **The code is older than the primitives.** It still writes loose objects, keeps a type's fields and a holon's name inside the body, and its birth reads markdown that is no longer here. Bringing it to the primitives as they stand, with packs, is the next build. The new interface comes after that: a glass for the human, born from this store.
- **Memory is off** for every session (`.claude/settings.json`). What a session knows is in the field.
