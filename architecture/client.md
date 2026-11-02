---
under: the rule
kind: brief
---

# The client

The client is the whole application: a chassis that hosts the page, a real engine that runs in the browser, and the interface that draws from it, speaking one protocol. It pulls a store and runs over it, so whoever opens it touches a real engine they can change things with, and the data they work on is theirs.

*The author's decision, 2026-11-01: we are running an engine in the client, over data in the client, that you can change in the browser.*

## 1. Why the engine runs in the client

Anything more than reading needs a real engine near the reader. Editing in place, tabs, a layout that can be changed, all are state, and state needs a field and an engine to govern it; without them everything stays primitive.

The engine could stand on the internet, with every visitor's interface speaking to it, but then what each visitor may run and commit must be scoped, and authentication comes first. Or the site serves only the store, and each client runs its own engine over what it pulled: then nobody touches the author's engine, and whatever a reader does lands in their own field, which is how they own their data.

*The author's reasoning and decision, 2026-11-01: if there is to be any WYSIWYG it requires a real engine; the engine on the internet needs authentication or a scope to what can be committed; the client's own engine gives data ownership.*

### 1.1 What the choice leaves out

Nothing a reader does reaches back to the author by itself: their notes and their visits stay in their own client, unless something is built to receive them. An engine on the internet stays possible later, as narrow as the field declares.

*Reasoned, the session's, 2026-11-01.*

## 2. Three parts

The parts are OpenLight's, and each keeps to its own work.

*Carried from OpenLight's engine, chassis and view specs, read 2026-11-01.*

### 2.1 The chassis hosts and decides nothing

The chassis is the page itself: it serves an almost empty document, starts the engine, installs the channel between the engine and the interface, and turns what the browser gives, its address and its back and forward, into input for the engine. Which components draw, what is attached and what the layout is are all field data, read through the engine, so nothing in the chassis is policy.

*Carried from OpenLight's chassis.*

### 2.2 The engine is headless

The engine holds the field and is the only way into it. It reads, commits and runs programs, and it judges every act against what the field declares, whoever asks: a program, a component, the reader. It draws nothing and serves no pages; its one contract is the protocol, so nothing that speaks to it depends on how it is built.

*Carried from OpenLight's engine: the wire is its only contract.*

### 2.3 The interface draws and holds nothing

The interface is the components and what mounts them. It mounts what the layout names, reads for each mount what it is given, and draws it again when a commit touches what it read. What a component does, it does as an ordinary commit or run, judged by the engine. What lasts is in the field, never in the interface.

*Carried from OpenLight's view.*

## 3. One protocol

Everything that speaks to the engine uses the same few operations: read, commit, run, await, cancel and subscribe. In the browser they travel as messages to the engine's own thread, so the engine never holds up the drawing.

*The operations OpenLight's; the browser's thread reasoned, the session's, 2026-11-01. How a read is asked, before an expression language exists, is [open](../plan.md#3-what-is-open).*

As built, a read asks for a holon by identity, now or at a commit, for what a name gives, for what points at a holon, for a type's instances, or for a store's head. Beside read, commit and subscribe there is attach, which the chassis uses to attach the store the page names; run, await and cancel wait for programs.

*Built by the session, 2026-11-03.*

## 4. Only the engine and the chassis switch

Running glass on one's own machine is the same store and the same interface with another engine and another chassis: the engine as a program of its own, the chassis as a window. Nothing in the store or the interface depends on which.

*The author's, 2026-11-01: for running locally, only the engine and the chassis would switch. The local engine is not built yet, and the author does not need it yet.*

## 5. A full client, preloaded

Since the engine is headless, nothing ties the client to one store. It is a full client that comes preloaded with a default, one store attached and one entry, the layout it boots into, and it can attach any other store as well. A store that brings its own components brings code with it, so attaching one is a deliberate act, asked for and seen, and what it draws runs apart from the rest.

*The author's, 2026-11-01: we are virtually creating a full capable client, it just comes preloaded with its default settings and connection. The consent and isolation are OpenLight's.*
