---
under: the rule
kind: brief
---

# The primitives

Data, types, programs, AI and interfaces are one field of whole pieces, and everything else in glass grows on them. Here they are in the order they stand on each other: the holon, its type, the store that keeps it, the engine that holds the stores, the field they make, the program, its effect, AI, and the interface. They are few on purpose: the author's aim is a core set of primitives, done with quality.

*The author's, from [the grant](said/2026-10-31.md#12-what-is-new) and [his words of 2026-10-31](said/2026-10-31.md#2-a-runtime); the store and the engine named as primitives his, [2026-11-01](said/2026-11-01.md#15-reading-the-primitives).*

## 1. Holon

A holon is a small piece that is whole in itself, and part of the field and of any whole that holds it. A note is a holon, and so is a program, a type, a component and a mount: the same kind of piece throughout.

A holon is its identity, what it is an instance of, and its body: what it holds. The identity is given when it is born and never changes; every state it has had is kept as a version, each pointing back at the one before, so how it came to be stays readable.

*Whole pieces the author's, from the grant; part of the field his, 2026-11-02: everything is part of the field; that holons have ids and history his, 2026-11-01 ("holons have to have ids I think and have to have commits"); the shape of versions the session's, laid out in [the store](architecture/store.md).*

## 2. Type

A type is a schema in the field: the structure a holon's data has. Data is by its nature structure, and types are what let a field hold structure of its own making, declared in the field itself, so a type is a holon too. Programs need data, and types are what they find it by.

*The author's, 2026-11-01: type is what allows you to create schemas within the field, what allows for structure, and that is what programs need. How a type is written, and how the store checks a holon against it, is [open](plan.md#3-what-is-open).*

Each field a type declares is said in prose as well as in structure: what the key means, beside the shape the engine checks. A field is where holons connect, so the fields are the field's ontological connectors, and holons joined at them form a larger ontology, readable by a person, a program or a language model alike.

*The author's, 2026-11-02: the fields of a holon are contact points for prose, so that we can build ontologically upon them; where each holon connects are the ontological connectors, forming larger ontology. That the prose stands beside the checked shape, and models read it, the session's proposal of the same day, which he answered yes.*

## 3. Store

A store is where holons are kept and how they travel: every version of every holon, and every commit that changed them, as objects that never change, with one pointer saying which commit is current. A store can be copied, served and attached anywhere, and every copy is whole.

*The store as a primitive the author's, 2026-11-01; its shape proposed by the session and agreed by the author, given whole in [the store](architecture/store.md).*

A store is one space, and any whole within it can be taken away as a store of its own.

*The author's, 2026-11-04, told in [the store](architecture/store.md#81-taking-a-whole-away).*

A store is one source among the engine's integrations, the native one: git, the browser's history or a video's data are sources too, each with its own truth and format, reached through programs.

*The author's, 2026-11-04, told in [the store](architecture/store.md#10-every-source-is-an-integration).*

## 4. Engine

The engine holds the stores it attaches and is the only way into them. It reads them, carries out every change as a commit, and runs programs, and it judges every act against what the field declares, whoever asks. Nothing reaches a store but through an engine.

*The author's, 2026-10-31 and 2026-11-01: a field needs an engine to govern it; carried from OpenLight's engine. How the engine runs a program, in what runtime and how contained, is open.*

## 5. Field

The field is the stores an engine holds, read as one: where holons live together, and what programs and people ask. Holons hold each other as parts and point at each other from their bodies, so from any holon the field can be read upward to what holds it, downward to what it holds, and outward to what points at it.

*The one field the author's, from the grant; stores read as one carried from OpenLight; how holons relate, the author's, 2026-11-02, told in [the relations](architecture/relations.md).*

## 6. Program

A program is a holon holding code that the engine runs. It declares the types it takes, the engine brings it the data that fits, and what it does, it does through the engine. A run is a program run once, kept as a holon too: what it was given, its result, and the commits its effects became.

A program exists only through the engine: it is data until the engine runs it. How a run is carried out is the engine's, and still open.

*The author's, 2026-11-01: the program only exists through the engine, and how it is executed and run is open. Runs kept as holons his, the same day ("it does use the field for runs, I would think"); where they are kept is [the home](architecture/home.md).*

A function is not a program. It is pure: evaluated wherever it is used, as in what an interface draws, every time it is drawn, so evaluating it is no event and nothing it gives is kept. A program is run, and a run is an event with a record. Both are first class, and a program cannot be used where a function is.

*The author's, 2026-11-03: functions are different from programs, and functions are what are used in the UI; we're not renaming program to function, they're still a first class thing; can you use a program in a UI, I don't think you can.*

## 7. Effect

A program acts by changing the field, and every change is a commit. The engine carries out the run, but what a run may touch is the field's to say: each place declares which programs may change it, and the engine follows that declaration. So every effect lands where it can be seen, within bounds the field itself holds.

*The author's, 2026-10-31: the engine governs the execution but is merely governed by the declaration of the field. That each place declares it is the session's reading, as glass's first iteration built it.*

## 8. AI

A completion model is a program, and each tool is a program of its own, separate from it. What is called an AI today is practically a harness: a program that calls a proprietary completion API and runs the tool calls it gets back. In glass the model, the tools and the harness are each a program in the field, taking their context from it and acting through it.

*The completion model and the tools as separate programs, and AI as practically a harness, the author's, 2026-10-31; the harness as one more program the session's synthesis.*

## 9. Interface

An interface is holons drawn by holons. A component is a holon that declares the type it takes and draws what it is given, made of code or of data; and a mount is a call to one, a component given what it reads, its argument. A component encloses what it is given and opens a space in it, where what it holds is drawn in turn by the components whose types match, so an interface assembles itself level by level.

*The author's, 2026-10-31: each component encloses and opens space for new holarchy and new type-matched components therein. The mount is OpenLight's.*

The primitives are still: they hold no state, take no press and move nowhere. Looking around the field is built on them, as one mount the reader keeps in their home and gives a new version each time they look elsewhere.

*The author's, [2026-11-03](said/2026-11-03.md#17-the-root-as-a-mount): there is no state, no interaction, no navigation; it is something to birth upon the primitives, so it is editable. The one root mount the session's, from OpenLight's.*
