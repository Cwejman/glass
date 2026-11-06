# Glass

Glass puts data, programs, AI and interfaces in one place, as small whole pieces kept with their whole history. Since 2026-11-06 glass's knowledge lives in its store, as holons, not in markdown. This file is the one way in: it says how the store is laid out and how to read it.

## Where things are

Everything is a holon: `{id, instance, name?, mould?, body}`. The `id` is a ULID given at birth. `instance` is the type the holon is an instance of. A type is a holon with a `mould`, which says what its instances hold, field by field, each in prose. Inside a body, `{"$ref": id}` is a reference to another holon. A reference holds (makes the other a part) or only points, as the mould says, or as `$holds` on the reference itself says.

`branches/` holds the stores, each one JSON array with one holon per line:

| File | What it holds |
|---|---|
| `union.json` | The way in: one holon that points at every store's roots and holds none. |
| `primitives.json` | The types. Read their moulds first. |
| `lexicon.json` | Every word as one: the lexemes that words point at. |
| `wiki.json` | The wiki that was markdown, to the word: briefs, paragraphs, sentences, words. Links are references. |
| `markdown.json` | Markdown's surface, kept apart: with the wiki it rebuilds each old file. |
| `session.json` | The author's words in the second session of 2026-11-06, utterance by utterance, and the paths of evolution noted beside them. |
| `fork-licence.json`, `fork-selection.json` | Two forks that met that session, each pointing at it. |
| `statistics.json` | Statistics declared as prose and expression, never stored, over proposed functions. |
| `slices.json` | The store cut into the commits it would be born in, each declared by its roots. |
| `tools/` | Scripts that read and write all of it (see its README). |

`references/` holds works from outside the field. One is there now: a paper on holonic systems, with its licence as a holon. By that licence its holons and the branches drawn over it stay on the machine that made them.

The author's words before the store, a day to a file, are briefs in `wiki.json` under the paths `said/2026-10-30.md` to `said/2026-11-06.md`. The wiki grew from them; read one with `bun branches/tools/read.ts said/2026-11-05.md 9`.

## How to read

Start at the union, then read whatever its roots lead to:

```
bun branches/tools/read.ts union
bun branches/tools/read.ts README.md 1       the old wiki's entry, a level down
bun branches/tools/read.ts primitives.md     the primitives in prose
bun branches/tools/read.ts 2026-11-06-second the latest session and its paths
bun branches/tools/read.ts session           any type, by its name
```

The text is drawn from the holons each time; none is stored. A word is `before + text + after`, a sentence is its words, and a paragraph is its sentences.

## Where it stands

- **The holons are the source now.** The birth from markdown has ended. Any birth from here only adds diff-packs: one per commit, each holding only what that commit adds (see the path "The store packed, carried by git" in the session).
- **The code is older than the primitives.** `src/` still writes loose objects to `site/store`, and still keeps a type's fields and a holon's name inside the body. Bringing it to the primitives as they stand, with packs, is the next build. The new interface comes after that: a glass for the human, born from this store.
- **Memory is off** for every session (`.claude/settings.json`). What a session knows is in the field.
