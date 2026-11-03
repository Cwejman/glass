---
under: the rule
kind: brief
status: proposed
---

# The plan

The first mark is to read this wiki from a real store, through a real engine in the browser, along the gradient. It makes the store, the engine, the interface and the first reader real, each well made, and everything after stands on them. It is built, and waits for the author to read it.

*Proposed, the session's, 2026-11-01, on the author's call to settle something small as a clear goal; built 2026-11-03, on his word that the whole of what is to be built is now to be seen.*

## 1. The first mark

Five steps, each standing on the one before, and none a shortcut: the reader is built on the interface, not in its place, and the wiki is born in once a person can really navigate it.

1. **The store.** Its format written as test vectors that any implementation must pass: given objects, their canonical text and their names; given changes, the commits, indexes and versions they make. Then a writer and a reader that pass them. The store needs almost no code, and no language of its own.

2. **The engine.** It attaches a store over HTTP, checks everything it fetches, keeps its own store for the home, and answers reads and commits in [the one protocol](architecture/client.md#3-one-protocol), tested at its own layer with no interface.

3. **The interface.** Components as holons that declare the type they take, mounts as calls to them, layouts held as data, and a component enclosing what it is given and opening space in it for what matches, so [the interface](primitives.md#9-interface) assembles itself level by level. The chassis hosts it and decides nothing.

4. **The reader component.** A component on that interface that draws a brief along the gradient, and [the first reader](knowledge.md#3-the-first-reader-component) built from it: a person can move through the whole wiki, down into parts and back.

5. **The wiki in the store.** This wiki born into a store as its first commit, each brief an instance of the brief type, whose fields are said in prose, so the store holds its own spec.

It is done when the author opens the page and navigates this wiki from the store, everything beneath it well made.

*Proposed, the session's, 2026-11-01; the interface built properly before the reader, and the wiki born in once it can be navigated, the author's, [2026-11-02](said/2026-11-02.md#16-well-done-when-i-arrive): if there is no reason to shortcut, build it with quality.*

### 1.1 How it is built

Tests come first at every layer, and the work is done by agents orchestrated to it, with rigour and freedom both: every finished piece is taken up by a new agent, fresh to it, who reads it from its own angle, and what that agent finds is mended before the next piece stands on it.

*The author's, 2026-11-02: for every finished thing there always spawns a new agent to take its angle.*

### 1.2 Where the first mark stands

Each step is built, tested, read by a fresh agent and mended:

- **The store**: its vectors, made apart from its code; a store as files, in memory and in the browser's storage; every object checked by its name, its form and where it stands in the tree.
- **The engine**: stores attached and read as one, every commit judged against its types and taken in turn, references indexed, the home the one store written, on its own thread in the browser.
- **The interface**: the chassis, components born as holons from their code, mounts held by a layout, type-matched spaces, and the arrangement kept in the home, so moving through the wiki, back and forward, and a reload all stand on its commits.
- **The reader**, then [the interface as a mirror of the field](architecture/interface.md): the entry stands at the field itself, its stores, names and types; a type shows its fields and its instances; a brief is drawn by its own values, its parts a list of mounts each drawn as a face; and the wildcard draws any other holon by its values, every reference in them entered from there.
- **The wiki in the store**: born from these files with glass's types and components, each brief a holon judged by the engine, keeping its id across births by its file and heading; a heading renamed is born as a new holon, and what the files no longer hold is taken out of the field, its history kept.

Not yet built, though the briefs describe them: what is attached is named by the page, not kept in the home; run, await and cancel wait for programs; components run in the page itself, not apart, which is safe only while the one store attached is glass's own; and a brief's prose is one piece of markdown.

[How the code is laid out, and run](src/README.md)

*Built and written by the session, 2026-11-03.*

### 1.3 Written in TypeScript

The engine and the interface are written in TypeScript first. The store asks almost no code of any language, and the browser hashes natively, so nothing yet argues for another. The store's test vectors keep the door open: an engine in Rust compiled to WebAssembly, one engine for the browser and the author's machine with programs contained in it, can come later and pass the same tests without any store rewritten.

*The session's recommendation, which the author saw no reason against, 2026-11-02.*

The components are written in TSX, so a component reads as the shape of what it draws. A small factory of glass's own turns the markup into the page's own elements, with no framework between: a component stays a function from what it is given to what it draws, drawn again whole when what it read changes, which asks for nothing a framework's reactivity would add.

*The session's, agreed by the author, 2026-11-03; OpenLight chose Solid.*

## 2. After the first mark

What waits, roughly in the order it stands on what comes before it. None of it is begun, and the order is a claim to be agreed or refused.

- **The fully immersive interface.** Editing in place, with the reader's own branch of a pulled store; what drew each holon, and why that component matched it, shown and edited where it stands; a context menu of actions; and the code and the JSON of anything readable where it is drawn, nothing locked away in a panel.

- **The home**, kept in the browser: what is attached, the entry, the arrangement, and reset and clear as programs.

- **Runs, visible.** Runs kept in the home and drawn as they go, like an agent session; actions a component declares, such as adding a holon, that run a program; and the harness with its completion model and tools.

- **Components as code and as data**: expressive components and layout components written as code, and components that are data, templates.

- **The URL**, and sharing as an act.

- **OpenLight's reader**, with selections, intersection and many places.

- **Publishing**: glass's pinned builds on its own Pages, and the author's site as a store beside a client pointed at it.

- **The engine on the author's own machine**, the other engine and chassis.

- **Glass's components as a store** of their own.

*Proposed, the session's, 2026-11-01; the immersive interface, visible runs and components as code and data are the author's, 2026-10-31.*

## 3. What is open

Questions the first mark meets, and those beyond it, each to be settled when the work reaches it.

- **How a component is found for a mount**: matched by type each time it draws, as now, or picked from a table of defaults and recorded in the mount, as OpenLight ruled, in [the interface](architecture/interface.md#4-which-component-draws-a-mount). The author does not know yet; whatever is built on it is built knowing it may change.

- **What kind a slot is**: a contract between holder and held over a vocabulary of kinds, full and face, with the slot's own data first, as [the interface](architecture/interface.md#5-a-slot-and-the-kind-it-is) proposes. Taken provisionally; the author does not know it is right.

These two, how a component is found and what kind a slot is, are decisions whose rightness is not known: whatever would be built depending on either is named before it is built, so the author can weigh it.

- **The material.** How things look is held in the field as a holon of its own, a style sheet of named colours, type and spacing that every component draws with, so the chassis holds no style. It was built on 2026-11-03, named from the author's word for what one builds in; whether this decoupling serves, and whether the word should mean that or something wider, he does not know yet.

- **A holon's identity.** The session leans to a sortable random id, so an id also carries when the holon was born.

- **How a type's contract is written**, and how the engine checks a body against it at commit; that a holon's types are stored as its instance, and that each field is said in prose beside its shape, is settled.

- **Provenance.** A published commit says nothing of the run that made it, so only the runner's home knows; whether published history should say how it was made.

- **Events as holons.** Thousands of visits nobody edits or points at may be better as rows within one holon each day.

- **Whether a store ships its index** of references and values, or every engine builds it.

- **How a read is asked.** OpenLight reads by expression, and glass has no expression language yet; the first reads are by identity and by what stands beneath.

- **Prose as typed parts**, as [knowledge](knowledge.md#2-prose-stays-prose-for-now) leaves it.

- **Merging**, when two lines of commits meet.

- **Who published, provably**: keys and signatures on what a store's ref points at.

- **When the shape of kept state changes**, as [the home](architecture/home.md#7-when-the-shape-of-state-changes) says.

- **What site is built on glass**, which is not known yet and not needed for the foundation.

*Open, 2026-11-01.*
