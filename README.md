# Glass

Glass puts data, programs, AI and interfaces in one place, as small whole pieces kept with their whole history. Since 2026-11-06 glass's knowledge lives in its store, as holons, not in markdown. This file is the one way in: it says how the store is laid out and how to read it.

Glass comes from two of the author's works. [OpenLight](https://github.com/Cwejman/OpenLight) gave the vision and most of the architecture: the engine, the chassis, the view and the reader that glass carries, and glass is its successor. [The rule](https://github.com/Cwejman/the-rule) gave the shape knowledge takes: the biggest understanding first, each breaking down into smaller ones, as briefs in a holarchy. The wiki's Where it comes from tells what glass keeps of each.

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
- the second session of 2026-11-06, utterance by utterance, with its paths of evolution, and the forks that met it; the third session, of 2026-11-07 and 2026-11-08; a fourth and a fifth, of 2026-11-08, kept in brief; a sixth, of 2026-11-09, kept whole; a seventh, of 2026-11-09 and 2026-11-10, an eighth, of 2026-11-10, and a ninth, of 2026-11-10 and 2026-11-11, kept whole in the author's words;
- statistics declared as prose and expression, never stored;
- measures on what was said, sessions and passages graded with a note, none of them a conclusion: read them to reason about what to read. Briefs the work has overtaken are measured too, as stale;
- threads raised from what was said that no brief owns yet.

Almost nothing stands loose. The main store has ten roots: the lexicon, what was said, the wiki, its markdown forms, the threads, the measures, a whole for statistics and functions, one for the sessions, one for the types, and the author's voice, which speaks across them. A session holds its own, and a source what stands upon it.

Its first 81 commits are its birth, a slice each in the order things came. The conversion to blocks came after 117; each old commit is still in the log, with its old hash, what it held and what it took out, and the field at any of them can be drawn again.

Beside the main store stand three more, each a whole in its own folder. `store/paper/` is the work: a paper on holonic systems as published (`paper.pdf`), its licence (CC BY-NC-ND 4.0, read as a holon), and the paper as holons, one to one, in its own order and word. `store/paper-readings/` holds the 17 readings built upon it, each in its readers' own words, holding the paper's paragraphs by reference. The licence says why both may be public: a change of format is no adaptation, and holons built upon a work do not rework it. `store/glass/` is what the client ships: its types, functions, kinds of slot, material and components, their code held as holons, and the mount it boots into. It is made from `src/field/` by `bun run field`.

## How to read

Read through the engine, in the language. `src/tools/ask.ts` attaches every store on this machine to a local engine, as the browser does, and asks it one expression: calls of functions, a holon after `@` by its id, its name or a route of names through what holds it, a lambda `m => …`, `m.key` for what m holds under key, and `a | f(b)` for f(a, b). A string comes back as it is, so prose reads as prose, and a holon as its id, its name and what it is. The functions are listed with what each says in `src/field/functions.json`, and the language at the top of `src/language/text.ts`.

```
bun src/tools/ask.ts 'level(store("main")) | map(h => {name: h.name, tokens: measure(h)})'
                                                       the main store's roots, measured
bun src/tools/ask.ts 'outline(@"The wiki", 3)'         a whole's structure, measured, without its prose
bun src/tools/ask.ts 'text(@"The wiki")'               the wiki whole, as prose
bun src/tools/ask.ts 'digest(@Sessions, 4000) | map(run => {first: first(run).name, tokens: measure(run)})'
                                                       a whole cut into pieces to read, in order
bun src/tools/ask.ts '@Sessions.sessions | sort(s => s.on) | reverse | take(2) | map(text)'
                                                       the two latest sessions, whole
bun src/tools/ask.ts 'type(@types/measure) | filter(m => eq(m.value, 3)) | map(m => {about: m.of, note: m.as})'
                                                       what was said, measured three
bun src/tools/ask.ts 'type(@types/thread) | map(t => {raised: t.raised, stands: t.stands})'
                                                       the threads raised from what was said
```

A brief the work has overtaken carries a measure that says so, its note saying what no longer holds: `bun src/tools/ask.ts 'type(@main:types/measure) | filter(m => eq(m.as, "stale")) | map(m => {of: m.of, note: m.note})'` lists them, and none stand today. A key a holon does not hold gives null, never an error, so `@types/session.mould | keys` is the way to know what to ask for.

A name a holon shares with others is refused with each holon it finds and what holds it, so the route that finds one can be said: `@Glass/"The grounds"`. `--json` gives the engine's answer as it is; `--file` reads the expression from a file.

The probe and the read tool, which read the blocks beside the engine, were retired for it on 2026-11-10. The routes earlier sessions wrote, as `9.1.21-22`, were the probe's, and are read now by what they name.

A brief does not show its own stale mark when read, so read those marks before trusting the wiki. A brief the work overtakes is marked first and rewritten when the work settles, as `src/tools/rewrite.ts` does; what was said stands as it was, and is never measured stale.

The text is drawn from the holons each time; none is stored. A word is `before + text + after`, a sentence is its words, and a paragraph is its sentences. `src/tools/append.ts` adds to the store, as one commit; `src/tools/README.md` says how.

## The code

`src/` holds the store, the engine, the interface, the field glass ships (`src/field/`), the page (`src/site/`) and the tools. `src/README.md` says where each lives. Its tooling lives with it: run `bun install`, `bun test`, `bun run check` and `bun run build` from inside `src/`. The build writes the site into `site/` at the root, which is output only and never kept. The tools can be run from anywhere, as `bun src/tools/ask.ts` from the root.

## Where it stands

- **The store is blocks.** The packs before them, and the JSON before those, are in git's history only. The birth from markdown has ended.
- **The code is brought to the store.** One implementation of the format, in `src/store/`, serves the tools, the browser and the home. The engine reads holons by their moulds, holding apart from pointing, and fetches only what a read needs; the interface reads prose from its holons. Not yet built: running programs, and a reader's own branches of a pulled store. The home keeps what is attached; the page still says what to attach at each start.
- **What one looks at is a level of the holarchy.** A way of looking shows what nothing in it holds, `flat` shows all of it, and `group` takes an axis chosen. The root gives what is attached, kept in the home; the page names the entry, and everything else is reached from what it offers.
- **One language, worked out by the kernel.** An expression is calls of functions, lambdas and values, held as data; the kernel in `src/engine/kernel.ts` works it out to a value over everything the field holds, and the interface's sets are asked of it too. Glass's functions are named each by one word, some written in the field in the language itself (`src/field/functions/`). It is said as text, read and said again by `src/language/text.ts`, and written in code by a template. Agents read the field through a local engine by `src/tools/ask.ts`, as How to read says; the probe and the read tool were retired for it. The eighth session, kept whole with the essence of its answers, holds how it came: `bun src/tools/ask.ts 'text(@"An eighth session, kept whole: one language for expressions, the kernel drawn into the engine, and the field read at the command line")'`.
- **The format is settled for now,** with its vectors. Two paths of the second session were tried on 2026-11-08: one hash per commit and addresses by position gave way to a hash per block, and counted names to short unique ones, so a store can be taken away, changed, and brought back. What is left open is at the end of `src/store/vectors/README.md`.
- **The address is the one language too.** One holon is said by its route of names in the query, `?place=main/The+wiki/Glass&id=…`, its id beside it so a moved name still leads there; anything else as an expression, `?look=level(store("main"))`. A route may begin at a store, `@main:types/brief`. The `route` function says the way down, for the address and for a brief alike, and the search takes words said in the language.
- **Patterns of facts.** A function gives a third way: `find(?m, [?m, "instance", @main:types/measure], [?m, "value", 3])`. A holon is read as facts, holding said under `$holds`, and `explain` says the plan. The clause is the contract between the engine and a store: the engine plans and joins, builds an index for a store that only gives its holons, and for now never ships it, since it is about the size of the store and costs about what reading it does. A step is asked once for each binding or once for them all, whichever costs less in all: a narrow question takes a millisecond or two, a store's level about 155 ms. A list and a set are told apart at commit. The brief is Patterns of facts, under Looking from many angles.
- **Stores, integrations and attachments are settled, not built** (2026-11-11). A store is a field with one root, a `store` holon saying its shape, contents, dependencies and origin, never where it is served. An integration is a program bridging a source to a field of one shape; an attachment is what an engine uses, writing granted there alone; the engine keeps no store of its own, and the home is the reader's own store, an attachment the page always makes writable. An act is one commit in every store it touches, with two hashes, its content and its history, and `parent` becomes `predecessor`. The code is to be modules at the root, each with its store in `.glass/`. The section is Stores, integrations and attachments, under The architecture; the ninth session holds how it came: `bun src/tools/ask.ts 'text(@"A ninth session, kept whole: stores as fields, attachments, one act one commit, and the code as modules")'`.
- **What comes next is The plan from here**, said again at the ninth session's end: `bun src/tools/ask.ts 'type(@types/path) | filter(p => and(eq(p.name, "The plan from here"), eq(p.stands, "noted"))) | map(text)'`. In order:
  1. **Modules at the root,** each with its store in `.glass/`: engine, language, interface, components, `integrations/glass` with its vectors, author and site, the wiki the root's own store; canonical text and hashing the engine's. The next session begins here.
  2. **One act, one commit** in glass's own format: a line holding the act whole, its predecessor and which blocks are its own, two hashes, a holon kept in every store that holds it; old lines read as they are, the vectors made anew.
  3. **The engine on attachments,** with no store of its own: commits sent to the stores that hold what they change, refused where a store is not writable or its shape does not admit a type; the command line the engine's own.
  4. **Each store given its root,** its types in the engine's store, and the top of the field seen three ways: attached, the stores, the unified field.
  5. **The site started from its store,** with the browser's own store attached to be written.
  6. **A buffer, then git,** built-in integrations each designed and attacked first; then how code mounts and runs.

  After them, from the eighth session's plan: the lexicon a pure function over the field's strings, its lexeme holons let go, a Term a holon with a page of its own; rules that recurse, where `follow` stands now; values in nested records as facts. Beside them, the interface as the eighth session's inspection found it: an expression that gives no set drawn as its value, the menu's functions given the place pressed, look here with a component, one's place kept on going back, the root saying where to begin, a statistic, the paper and the lexicon drawn as what they are, and links with an address of their own.

  When the types move to the engine's store, the main store's prose types held twice and the paper's set born apart are said once, and a commit that gives a whole two parts of one name is refused. As wanted: the statistics the main store declared in an older form said again in the language. Pinned: time and `at`, streams, programs beyond integrations. The wiki's own plan is a record of the first mark.
- **The wiki was brought to what stands on 2026-11-11.** What was settled and not built says so where it stands; its old prose is kept in each brief's history. Its plan is a record; what comes next is here.
- **No session starts on local changes.** What a session did is committed before it ends, the store's ref, log and blocks above all, since no other copy of them exists.
- **Memory is off** for every session (`.claude/settings.json`). What a session knows is in the field.
