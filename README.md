# Glass

Glass puts data, programs, AI and interfaces in one place, as small whole pieces kept with their whole history. Since 2026-11-06 glass's knowledge lives in its store, as holons, not in markdown. This file is the one way in: it says how the store is laid out and how to read it.

Glass comes from two of the author's works. [OpenLight](https://github.com/Cwejman/OpenLight) gave the vision and most of the architecture: the engine, the chassis, the view and the reader that glass carries, and glass is its successor. [The rule](https://github.com/Cwejman/the-rule) gave the shape knowledge takes: the biggest understanding first, each breaking down into smaller ones, as briefs in a holarchy. The wiki's Where it comes from tells what glass keeps of each.

The repository is modules at its root, each a folder of code with its store, where it has one, in a `.glass/` beside it; the main store is the root's own, in `.glass/`. To run glass itself: `bun run field`, `bun run build` and `bun run serve` from the root (the build makes the site's store first; the server serves every store live and holds one engine over them that the page mounts to, so what the tools commit is drawn at once), then open `http://127.0.0.1:4330/`. The same build published elsewhere starts an engine in the reader's browser.

## The store

Everything is a holon: an `id` (15 characters given at birth, unique across stores), the type it is an `instance` of, an optional `name`, an optional `mould`, and a `body`. A name is also its title, with no slug beside it, and is unique only among what one whole holds, so two wholes can each hold a "What is open". A type is a holon with a mould, which says what its instances hold, field by field, each in prose. Inside a body, `{"$ref": id}` is a reference to another holon. A reference holds (makes the other a part) or only points, as the mould says, or as `$holds` on the reference itself says.

A brief is a flow and its sections. Its `prose` is a flow of mounts in any order, a paragraph, a statistic, a brief, each reference saying whether it holds or points. Its `parts` are read through after the flow, and nothing follows them. A brief mounted in another's flow is a break, what starting a new file was, and placing it there is the deliberate act.

The store is blocks and a log: no other copy of it exists.

```
.glass/refs/main             "<hash of the last log line> <open volume>": written last
.glass/log/<n>.jsonl         the commits; each volume opens with the whole latest table
.glass/blocks/<hash>.jsonl   the versions, about 64 KB to a block, never touched again
.glass/conversion/ids.json   each old ULID's name, written once
```

A version is `{id, prev, instance, name?, mould?, body}`, with `prev` the hash of the block holding the version before. A commit is `{at, blocks, gone, predecessor, says}`, and `own` and `stores` where an act touched several stores: it names which holons it changed and holds none of their contents, and it is one act in every store it touches, named by the hash of its at, blocks, gone and says; a line written before 2026-11-11 names its `parent`. From the ref and the open volume alone, the latest version of any holon is one block away, checked by its hash; older versions and older commits are fetched only when asked for. `integrations/glass/vectors/README.md` is the format in full.

What the store holds:
- the types;
- the lexicon, a function over the field's words, `lexicon()`, where it was once a holon of every lexeme;
- the wiki that was markdown, to the word, with its links as references and markdown's surface kept apart;
- the author's words before the store, a day to a brief, under `said/2026-10-30.md` to `said/2026-11-06.md`: "As it was said", a root of its own, whose face the wiki's flow shows by pointing;
- the second session of 2026-11-06, utterance by utterance, with its paths of evolution, and the forks that met it; the third session, of 2026-11-07 and 2026-11-08; a fourth and a fifth, of 2026-11-08, kept in brief; a sixth, of 2026-11-09, kept whole; a seventh, of 2026-11-09 and 2026-11-10, an eighth, of 2026-11-10, a ninth, of 2026-11-10 and 2026-11-11, and a tenth, of 2026-11-11, kept whole in the author's words;
- statistics declared as prose and expression, never stored;
- measures on what was said, sessions and passages graded with a note, none of them a conclusion: read them to reason about what to read. Briefs the work has overtaken are measured too, as stale;
- threads: the questions held open in the field, raised by any voice, the author's, a session's or an agent's, each standing open, leaning, settled or let go; `author/thread.ts` raises and moves them.

Almost nothing stands loose. Each store has one root, a holon of the type store, which holds its top and names the stores it stands on; the main store's holds eleven wholes: the lexicon, what was said, the wiki, its markdown forms, the threads, the measures, a whole for statistics and functions, one for the sessions, one for the types, the author's voice, which speaks across them, and Knowledge, a knowledge space written fresh on 2026-11-12, apart from the wiki, from what glass is down to the engine's steps and the way from here: `text(@Knowledge)`. A session holds its own, and a source what stands upon it.

Its first 81 commits are its birth, a slice each in the order things came. The conversion to blocks came after 117; each old commit is still in the log, with its old hash, what it held and what it took out, and the field at any of them can be drawn again.

Beside the main store stand three more, each a whole in the `.glass/` of its own folder. `author/paper/` is the work: a paper on holonic systems as published (`paper.pdf`), its licence (CC BY-NC-ND 4.0, read as a holon), and the paper as holons, one to one, in its own order and word. `author/paper-readings/` holds the 17 readings built upon it, each in its readers' own words, holding the paper's paragraphs by reference. The licence says why both may be public: a change of format is no adaptation, and holons built upon a work do not rework it. `components/.glass/` is what the client ships, the store called `glass`: its types, functions, kinds of slot, material and components, their code held as holons, and the mount it boots into. It is made from the sources beside it by `bun run field`. Which folder holds which store, by the name it is asked by, is said once in `stores.ts` at the root.

## How to read

Read through the engine, in the language. `engine/ask.ts` attaches every store the repository holds to a local engine, as the browser does, and asks it one expression: calls of functions, a holon after `@` by its id, its name or a route of names through what holds it, a lambda `m => …`, `m.key` for what m holds under key, and `a | f(b)` for f(a, b). A string comes back as it is, so prose reads as prose, and a holon as its id, its name and what it is. The functions are in the glass store, each saying what it does: `bun engine/ask.ts 'type(@glass:types/function) | map(f => {name: f.name, says: f.says})'`; the language is at the top of `language/text.ts`.

```
bun engine/ask.ts '@main:main.contents | map(h => {name: h.name, tokens: measure(h)})'
                                                       what the main store's root holds, measured
bun engine/ask.ts 'outline(@"The wiki", 3)'         a whole's structure, measured, without its prose
bun engine/ask.ts 'text(@"The wiki")'               the wiki whole, as prose
bun engine/ask.ts 'digest(@Sessions, 4000) | map(run => {first: first(run).name, tokens: measure(run)})'
                                                       a whole cut into pieces to read, in order
bun engine/ask.ts '@Sessions.sessions | sort(s => s.on) | reverse | take(2) | map(text)'
                                                       the two latest sessions, whole
bun engine/ask.ts 'type(@types/measure) | filter(m => eq(m.value, 3)) | map(m => {about: m.of, note: m.as})'
                                                       what was said, measured three
bun engine/ask.ts 'type(@types/thread) | map(t => {raised: t.raised, stands: t.stands})'
                                                       the threads raised from what was said
```

What moved in certainty since a moment is asked of the log: `bun engine/ask.ts 'and(type(@types/thread), since("main", "2026-11-11")) | map(t => {name: t.name, stands: t.stands, asks: t.asks})'`.

A brief the work has overtaken carries a measure that says so, its note saying what no longer holds: `bun engine/ask.ts 'type(@main:types/measure) | filter(m => eq(m.as, "stale")) | map(m => {of: m.of, note: m.note})'` lists them, and none stand today. A key a holon does not hold gives null, never an error, so `@types/session.mould | keys` is the way to know what to ask for.

A name a holon shares with others is refused with each holon it finds and what holds it, so the route that finds one can be said: `@Glass/"The grounds"`. `--json` gives the engine's answer as it is; `--file` reads the expression from a file.

Writing goes through the engine too. `localEngine({ writes: ["main"] })` in `engine/serve/local.ts` is the same engine with the stores named written through it; its `commit` judges what it is given against the types and writes one act where each holon resides, as the browser's engine does. Every tool that writes uses it, and nothing writes to a store past it (2026-11-11).

The probe and the read tool, which read the blocks beside the engine, were retired for it on 2026-11-10. The routes earlier sessions wrote, as `9.1.21-22`, were the probe's, and are read now by what they name.

A brief does not show its own stale mark when read, so read those marks before trusting the wiki. A brief the work overtakes is marked first and rewritten when the work settles, as `author/rewrite.ts` does; what was said stands as it was, and is never measured stale.

The text is drawn from the holons each time; none is stored. A word is `before + text + after`, a sentence is its words, and a paragraph is its sentences. `author/append.ts` adds to the store, as one commit; `author/README.md` says how.

## The code

The code is modules at the root, each a folder standing on those before it, imported by relative path; how it is written is the wiki's How the code is written, under The grounds.

- `integrations/glass/`: glass's own format, the integration the engine speaks natively: canonical text, blocks, the log and its checkpoints, commits and landing, over files in a folder, at an address or in the browser's storage. Its vectors, made apart from its code, fix it.
- `engine/`: the field as a value and what reads and judges it, the kernel and patterns, the protocol and the worker it runs in; and its command line, `ask.ts`, the way an agent reads. The command line, the tools and the tests over the real stores find them through `stores.ts` at the root, which searches where they lie.
- `language/`: the language an expression is said in, as text, and a template for code.
- `interface/`: the contract components draw against, finding a component, drawing slots, the address, the root and the chassis.
- `components/`: the library's code, each component a file with what it declares of itself, and the material's stylesheet; `make.ts` builds them into the glass store. Glass's types, functions, kinds, reader and entry live in that store alone, and are changed there through the engine (2026-11-11).
- `author/`: the author's words and explorations, and the tools that write them.
- `site/`: the page, and the build that writes it, the client and every store into `site/dist/`, output only and never kept.

No file says which folder holds which store: every folder keeping a `.glass/` is one, named by its own root, the one holon in it of the type store, and `stores.ts` at the root finds them so (2026-11-11). Everything runs with Bun from the root: `bun install`, `bun test`, `bun run check`, `bun run format`, and, after changing a component, `bun run field`; after changing the engine or the interface, `bun run build`.

## Where it stands

- **The store is blocks.** The packs before them, and the JSON before those, are in git's history only. The birth from markdown has ended.
- **The code is modules at the root** (2026-11-11), each store in the `.glass/` of the module it is about, the main store the root's own, as The code says above. How the code is written is a brief of its own, under The grounds: `bun engine/ask.ts 'text(@"How the code is written")'`. Read it before writing code.
- **The code is brought to the store.** One implementation of the format, in `integrations/glass/`, serves the tools, the browser and the home. The engine reads holons by their moulds, holding apart from pointing, and fetches only what a read needs; the interface reads prose from its holons. Not yet built: running programs, and a reader's own branches of a pulled store. The home keeps what is attached; the page still says what to attach at each start.
- **What one looks at is a level of the holarchy.** A way of looking shows what nothing in it holds, `flat` shows all of it, and `group` takes an axis chosen. The root gives what is attached, kept in the home; the page names the entry, and everything else is reached from what it offers.
- **One language, worked out by the kernel.** An expression is calls of functions, lambdas and values, held as data; the kernel in `engine/kernel.ts` works it out to a value over everything the field holds, and the interface's sets are asked of it too. Glass's functions are named each by one word, some written in the field in the language itself, kept there as their expressions, and read as text by `text(@glass:functions/text)`. It is said as text, read and said again by `language/text.ts`, and written in code by a template. Agents read the field through a local engine by `engine/ask.ts`, as How to read says; the probe and the read tool were retired for it. The eighth session, kept whole with the essence of its answers, holds how it came: `bun engine/ask.ts 'text(@"An eighth session, kept whole: one language for expressions, the kernel drawn into the engine, and the field read at the command line")'`.
- **The format is settled for now,** with its vectors. Two paths of the second session were tried on 2026-11-08: one hash per commit and addresses by position gave way to a hash per block, and counted names to short unique ones, so a store can be taken away, changed, and brought back. What is left open is at the end of `integrations/glass/vectors/README.md`.
- **The address is the one language too.** One holon is said by its route of names in the query, `?place=main/The+wiki/Glass&id=…`, its id beside it so a moved name still leads there; anything else as an expression, `?look=level(store("main"))`. A route may begin at a store, `@main:types/brief`. The `route` function says the way down, for the address and for a brief alike, and the search takes words said in the language.
- **Patterns of facts.** A function gives a third way: `find(?m, [?m, "instance", @main:types/measure], [?m, "value", 3])`. A holon is read as facts, holding said under `$holds`, and `explain` says the plan. The clause is the contract between the engine and a store: the engine plans and joins, builds an index for a store that only gives its holons, carries it from field to field and patches a changed store's by what changed, and for now never ships it, since it is about the size of the store and costs about what reading it does. A step is asked once for each binding or once for them all, whichever costs less in all: a narrow question takes a millisecond or two, a store's level about 155 ms. A list and a set are told apart at commit. A word said is a clause too, `said(?w, "text", "glass")`, answered from each store's words as full text search answers, so string matching stands within the patterns (2026-11-11); the lexicon is such a pattern, `lexicon()`. The brief is Patterns of facts, under Looking from many angles.
- **Stores, integrations and attachments are settled; the format's part is built** (2026-11-11): one act, one commit in glass's own format, with its vectors, the rest still to build. A store is a field with one root, a `store` holon saying its shape, contents, dependencies and origin, never where it is served. An integration is a program bridging a source to a field of one shape; an attachment is what an engine uses, writing granted there alone; the engine keeps no store of its own, and the home is the reader's own store, an attachment the page always makes writable. An act is one commit in every store it touches, with two hashes, its content and its history, and `parent` becomes `predecessor`. The section is Stores, integrations and attachments, under The architecture; the ninth session holds how it came: `bun engine/ask.ts 'text(@"A ninth session, kept whole: stores as fields, attachments, one act one commit, and the code as modules")'`.
- **The wiki's top is Glass, as designed** (2026-11-11): what glass is, how code is written, the code's shape, what the author decided, and the way to the clean rewrite, written fresh before it and settled by the author. Where the wiki beneath it differs, it is what the rewrite is built from: `bun engine/ask.ts 'text(@"Glass, as designed")'`.
- **What came before it is From here**, under The plan: the vision in the author's words, what stands, what is not right, and the order the author set on 2026-11-11, the foundation first and a clean rewrite after it: `bun engine/ask.ts 'text(@"From here")'`. What waits on the author is `?look=awaiting()`.
- **The wiki was brought to what stands on 2026-11-11.** What was settled and not built says so where it stands; its old prose is kept in each brief's history. Its plan is a record; what comes next is here.
- **No session starts on local changes.** What a session did is committed before it ends, the store's ref, log and blocks above all, since no other copy of them exists.
- **Memory is off** for every session (`.claude/settings.json`). What a session knows is in the field.
