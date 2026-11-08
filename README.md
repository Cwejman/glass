# Glass

Glass puts data, programs, AI and interfaces in one place, as small whole pieces kept with their whole history. Since 2026-11-06 glass's knowledge lives in its store, as holons, not in markdown. This file is the one way in: it says how the store is laid out and how to read it.

The repository holds two things: `store/`, the holons, and `src/`, the code, with all its tooling.

## The store

Everything is a holon: an `id` (a ULID given at birth), the type it is an `instance` of, an optional `name`, an optional `mould`, and a `body`. A type is a holon with a mould, which says what its instances hold, field by field, each in prose. Inside a body, `{"$ref": id}` is a reference to another holon. A reference holds (makes the other a part) or only points, as the mould says, or as `$holds` on the reference itself says.

The store is packs: no other copy of it exists.

```
store/refs/main             "<commit> <pack>": the one line that ever changes
store/packs/<hash>.pack     the objects one commit adds, one canonical JSON per line
store/packs/<hash>.idx      each object's name -> [byte offset, length] in that pack
```

A version is `{kind, id, prev, instance, name?, mould?, body}`. An index is `{kind, names, holons}`, its tree of leaves keyed by the start of each id, its moment of birth. A commit is `{kind, parent, parentPack, at, index, says}`. From the ref alone, any object is reached by byte range, and checked by its name.

What the store holds:
- the types;
- one lexicon of every word;
- the wiki that was markdown, to the word, with its links as references and markdown's surface kept apart. The author's words before the store are among it, a day to a brief, under `said/2026-10-30.md` to `said/2026-11-06.md`;
- the second session of 2026-11-06, utterance by utterance, with its paths of evolution, and the forks that met it; the third session, of 2026-11-07 and 2026-11-08;
- statistics declared as prose and expression, never stored;
- measures on what was said, sessions and passages graded with a note, none of them a conclusion: read them to reason about what to read;
- threads raised from what was said that no brief owns yet;
- the union that reads it all.

Its first 81 commits are its birth, a slice each in the order things came. Each commit after them is a diff-pack.

Beside the main store stand two more, each a whole in its own folder. `store/paper/` is the work: a paper on holonic systems as published (`paper.pdf`), its licence (CC BY-NC-ND 4.0, read as a holon), and the paper as holons, one to one, in its own order and word. `store/paper-readings/` holds the 17 readings built upon it, each in its readers' own words, holding the paper's paragraphs by reference. The licence says why both may be public: a change of format is no adaptation, and holons built upon a work do not rework it.

## How to read

Chart before reading. `src/tools/probe.ts` shows the field from its roots, measured in tokens, and cuts any part of it into pieces that fit what a reader can take at once; each piece is a route, read with `--text`. Routes are counted within the scope they were charted in, so a route is read with the same scope:

```
bun src/tools/probe.ts --without paper,paper-readings                the roots, measured
bun src/tools/probe.ts --without paper,paper-readings --digest 4000  pieces to read, in order
bun src/tools/probe.ts 1.33-40 --without paper,paper-readings --text one piece, as prose
bun src/tools/probe.ts 58 --without paper,paper-readings --depths    a whole, layer by layer
```

Or start at the union, then read whatever its roots lead to:

```
bun src/tools/read.ts union
bun src/tools/read.ts README.md 1          the old wiki's entry, a level down
bun src/tools/read.ts primitives.md        the primitives in prose
bun src/tools/read.ts said/2026-11-05.md 9 a day of the author's words
bun src/tools/read.ts 2026-11-06-second    the latest session and its paths
bun src/tools/read.ts session              any type, by its name
bun src/tools/read.ts measured             what was said, measured: each a grade and a note, and the id to read it by
bun src/tools/read.ts raised               the threads raised from what was said, and where each stands
```

The text is drawn from the holons each time; none is stored. A word is `before + text + after`, a sentence is its words, and a paragraph is its sentences. `src/tools/append.ts` adds to the store, as one commit; `src/tools/README.md` says how.

## The code

`src/` holds the store, the engine, the interface, the birth, the field it shipped (`src/field/`), the store's test vectors (`src/store/vectors/`), the page (`src/site/`) and the tools. Its tooling lives with it: run `bun install`, `bun test`, `bun run check` and `bun run build` from inside `src/`. The build writes the site into `site/` at the root, which is output only and never kept. The tools can be run from anywhere, as `bun src/tools/read.ts` from the root.

## Where it stands

- **The store is the packs.** The JSON that came before them, and the scripts that served it, are in git's history only. The birth from markdown has ended.
- **The code is older than the store.** The engine and the client still read loose objects, keep a type's fields and a holon's name inside the body, and key the index tree by the end of each id. Bringing them to the packs as `src/tools/packs.ts` reads and writes them is the next build. The new interface comes after that: a glass for the human, born from this store.
- **The pack format is not final.** The last two paths of the session say how it is to change, before the code is brought to it: "Names counted in locality, unified where stores meet", and "Addresses by position, one fingerprint per commit". Under them, holons are counted within their store, objects are addressed by where they sit, there are segments per publish in place of a pack and an index per commit, and one hash per commit is the proof. Read them with `bun src/tools/read.ts 2026-11-06-second`, and the paths in full by their titles.
- **Memory is off** for every session (`.claude/settings.json`). What a session knows is in the field.
