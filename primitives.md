---
under: the rule
kind: brief
---

# The primitives

Data, programs, types, AI and interfaces are one field of whole pieces, and everything else in glass grows on them. Here they are as seven: the holon, the field it lives in, the program and its effect, the type, the AI that is programs, and the interface. They are few on purpose: the author's aim is a core set of primitives, done with quality.

*The author's, from [the grant](said/2026-10-31.md#12-what-is-new) and [his words of 2026-10-31](said/2026-10-31.md#2-a-runtime).*

## 1. Holon

A holon is a small piece that is whole in itself and part of what holds it. A note is a holon, and so is a program, a type, a component and a layout: the same kind of piece throughout.

A holon has an identity of its own, given when it is born, and every state it has had is kept as a version, each pointing back at the one before. What it is now is its latest version, and how it came to be stays readable.

*Whole pieces the author's, from the grant; that holons have ids and history his, 2026-11-01 ("holons have to have ids I think and have to have commits"); the shape of versions the session's, laid out in [the store](architecture/store.md).*

## 2. Field

The field is where holons live together, read and changed through an engine, the one program that holds the field and carries out every change to it. A holon that others stand beneath is a place. A field can be made of several stores, each kept and moved on its own, read as one.

*The one field the author's, from the grant; places and several stores read as one carried from OpenLight.*

## 3. Program

A program is a holon that acts. It says what it takes, finds the data it fits, and works on it from inside the field. A run is a program run once, and it is kept as a holon too, so what was done stays readable.

*The author's, from the grant and 2026-10-31; runs kept as holons his, 2026-11-01 ("it does use the field for runs, I would think"), and where they are kept is [the home](architecture/home.md).*

## 4. Type

Programs match the data they fit by type. What a type is in glass is still to be said: the session's lean is a type as a shape, itself a holon, which a holon is of when it has that shape, so a program says what it takes and the field brings it what fits.

*The matching the author's, from the grant; the shape the session's lean; the author asked on 2026-10-31 for what is said of type to be reconsidered completely, and it is [open](plan.md#3-what-is-open).*

## 5. Effect

A program acts by changing the field, and every change is a commit. The engine carries out the run, but what a run may touch is the field's to say: each place declares which programs may change it, and the engine follows that declaration. So every effect lands where it can be seen, within bounds the field itself holds.

*The author's, 2026-10-31: the engine governs the execution but is merely governed by the declaration of the field. That each place declares it is the session's reading, as glass's first iteration built it.*

## 6. AI

A completion model is a program, and each tool is a program of its own, separate from it. What is called an AI today is practically a harness: a program that calls a proprietary completion API and runs the tool calls it gets back. In glass the model, the tools and the harness are each a program in the field, taking their context from it and acting through it.

*The completion model and the tools as separate programs, and AI as practically a harness, the author's, 2026-10-31; the harness as one more program the session's synthesis.*

## 7. Interface

An interface is holons drawn by holons. A component is a holon that declares the type it takes and draws what it is given; a mount is a call to one, a component given what it reads; and a layout is mounts, held as data. A component encloses what it is given and opens a space in it, where what it holds is drawn in turn by the components whose types match, so an interface assembles itself level by level.

*The author's, 2026-10-31: each component encloses and opens space for new holarchy and new type-matched components therein. The mount is OpenLight's.*
