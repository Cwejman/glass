# Glass

Glass puts data, programs, AI and interfaces in one place, as small whole pieces kept with their whole history. Since 2026-11-06 glass's knowledge lives in its store, as holons, not in markdown. This file is the one way in: it says how the store is laid out and how to read it.

The repository holds two things: `store/`, the holons, and `src/`, the code, with all its tooling. To run glass itself: `bun run field`, `bun run build` and `bun run serve` from inside `src/`, then open `http://127.0.0.1:4330/`.

## The store

Everything is a holon: an `id` (15 characters given at birth, unique across stores), the type it is an `instance` of, an optional `name`, an optional `mould`, and a `body`. A name is also its title, with no slug beside it, and is unique only among what one whole holds, so two wholes can each hold a "What is open". A type is a holon with a mould, which says what its instances hold, field by field, each in prose. Inside a body, `{"$ref": id}` is a reference to another holon. A reference holds (makes the other a part) or only points, as the mould says, or as `$holds` on the reference itself says.

A brief is a flow and its sections. Its `prose` is a flow of mounts in any order, a paragraph, a statistic, a brief, each reference saying whether it holds or points. Its `parts` are read through after the flow, and nothing follows them. A brief mounted in another's flow is a break, what starting a new file was, and placing it there is the deliberate act.

The store is blocks and a log: no other copy of it exists.

```
store/refs/main             "<hash of the last log line> <open volume>": written last
store/log/<n>.jsonl         the commits; each volume opens with the whole latest table
store/blocks/<hash>.jsonl   the versions, about 64 KB to a block, never touched again
store/conversion/ids.json   each old ULID's name, written once
```

A version is `{id, prev, instance, name?, mould?, body}`, with `prev` the hash of the block holding the version before. A commit is `{at, blocks, gone, parent, says}`: it names which holons it changed and holds none of their contents. From the ref and the open volume alone, the latest version of any holon is one block away, checked by its hash; older versions and older commits are fetched only when asked for. `src/store/vectors/README.md` is the format in full.

What the store holds:
- the types;
- one lexicon of every word;
- the wiki that was markdown, to the word, with its links as references and markdown's surface kept apart;
- the author's words before the store, a day to a brief, under `said/2026-10-30.md` to `said/2026-11-06.md`: "As it was said", a root of its own, whose face the wiki's flow shows by pointing;
- the second session of 2026-11-06, utterance by utterance, with its paths of evolution, and the forks that met it; the third session, of 2026-11-07 and 2026-11-08; a fourth and a fifth, of 2026-11-08, kept in brief; a sixth, of 2026-11-09, kept whole; a seventh, of 2026-11-09 and 2026-11-10, kept whole in the author's words;
- statistics declared as prose and expression, never stored;
- measures on what was said, sessions and passages graded with a note, none of them a conclusion: read them to reason about what to read. Briefs the work has overtaken are measured too, as stale;
- threads raised from what was said that no brief owns yet.

Almost nothing stands loose. The main store has ten roots: the lexicon, what was said, the wiki, its markdown forms, the threads, the measures, a whole for statistics and functions, one for the sessions, one for the types, and the author's voice, which speaks across them. A session holds its own, and a source what stands upon it.

Its first 81 commits are its birth, a slice each in the order things came. The conversion to blocks came after 117; each old commit is still in the log, with its old hash, what it held and what it took out, and the field at any of them can be drawn again.

Beside the main store stand three more, each a whole in its own folder. `store/paper/` is the work: a paper on holonic systems as published (`paper.pdf`), its licence (CC BY-NC-ND 4.0, read as a holon), and the paper as holons, one to one, in its own order and word. `store/paper-readings/` holds the 17 readings built upon it, each in its readers' own words, holding the paper's paragraphs by reference. The licence says why both may be public: a change of format is no adaptation, and holons built upon a work do not rework it. `store/glass/` is what the client ships: its types, functions, kinds of slot, material and components, their code held as holons, and the mount it boots into. It is made from `src/field/` by `bun run field`.

## How to read

Chart before reading. `src/tools/probe.ts` shows the field from its roots, measured in tokens, and cuts any part of it into pieces that fit what a reader can take at once; each piece is a route, read with `--text`. Routes are counted within the scope they were charted in, the main store first, so a route is read with the same scope:

```
bun src/tools/probe.ts --only main                the roots, measured
bun src/tools/probe.ts --only main --digest 4000  pieces to read, in order
bun src/tools/probe.ts 9.1.33-40 --only main --text one piece, as prose
bun src/tools/probe.ts 4 --only main --depths      a whole, layer by layer
```

Or read any holon by its name, id or wiki path:

```
bun src/tools/read.ts README.md 1          the old wiki's entry, a level down
bun src/tools/read.ts primitives.md        the primitives in prose
bun src/tools/read.ts said/2026-11-05.md 9 a day of the author's words
bun src/tools/read.ts "A second session"   a session and its paths, by the start of its name
bun src/tools/read.ts session              any type, by its name
bun src/tools/read.ts measured             what was said, measured: each a grade and a note, and the id to read it by
bun src/tools/read.ts raised               the threads raised from what was said, and where each stands
bun src/tools/read.ts measured | grep -A1 ' stale:'   the briefs the work has overtaken, and what still holds in each
```

A brief does not show its own stale mark when read, so read those marks before trusting the wiki. A brief the work overtakes is marked first and rewritten when the work settles, as `src/tools/rewrite.ts` does; what was said stands as it was, and is never measured stale.

The text is drawn from the holons each time; none is stored. A word is `before + text + after`, a sentence is its words, and a paragraph is its sentences. `src/tools/append.ts` adds to the store, as one commit; `src/tools/README.md` says how.

## The code

`src/` holds the store, the engine, the interface, the field glass ships (`src/field/`), the page (`src/site/`) and the tools. `src/README.md` says where each lives. Its tooling lives with it: run `bun install`, `bun test`, `bun run check` and `bun run build` from inside `src/`. The build writes the site into `site/` at the root, which is output only and never kept. The tools can be run from anywhere, as `bun src/tools/read.ts` from the root.

## Where it stands

- **The store is blocks.** The packs before them, and the JSON before those, are in git's history only. The birth from markdown has ended.
- **The code is brought to the store.** One implementation of the format, in `src/store/`, serves the tools, the browser and the home. The engine reads holons by their moulds, holding apart from pointing, and fetches only what a read needs; the interface reads prose from its holons. Not yet built: running programs, a reader's own branches of a pulled store, and a home that says what is attached. The page says what is attached for now.
- **What one looks at is a level of the holarchy.** A way of looking shows what nothing in it holds, `Flat` shows all of it, and `Group by` takes an axis chosen. The root gives what is attached, kept in the home; the page names the entry, and everything else is reached from what it offers. The expressions were then taken down to a kernel: an expression is calls of functions, and a function gives by an expression, a pattern of facts, or code handed only values. A prototype, `src/engine/kernel.ts`, is grounded in nineteen real cases over the real stores. What comes next is in the seventh session's paths, read by `bun src/tools/read.ts "A seventh session"`.
- **The format is settled for now,** with its vectors. The second session's two noted paths, read by `bun src/tools/probe.ts 9.1.21-22 --only main --text`, were tried on 2026-11-08: one hash per commit and addresses by position gave way to a hash per block, and counted names to short unique ones, so a store can be taken away, changed, and brought back. What is left open is at the end of `src/store/vectors/README.md`.
- **What comes next is here, not in the plan**, whose brief stops at the first mark and is measured stale. Next is a glass for the human, born from this store.
- **The wiki was brought to what stands on 2026-11-08.** Its stale marks are resolved, its old prose kept in each brief's history. Its plan is a record; what comes next is here.
- **No session starts on local changes.** What a session did is committed before it ends, the store's ref, log and blocks above all, since no other copy of them exists.
- **Memory is off** for every session (`.claude/settings.json`). What a session knows is in the field.
