---
under: the rule
kind: brief
status: proposed
---

# The plan

The first mark proposed is to read this wiki from a real store, through a real engine in the browser, along the gradient. It is small on purpose: it makes the store, the client and the first reader component real at once, and everything after stands on them.

*Proposed, the session's, 2026-11-01, on the author's call to settle something small as a clear goal; in force once the author ratifies this wiki, before anything is built.*

## 1. The first mark

Four steps, each standing on the one before.

1. **The store.** The objects of [the store](architecture/store.md), ref, commit, index and versions, and a writer that births a folder of briefs written under the rule into a store as its first commit.

2. **The wiki in the store.** This wiki, born into a store as that first commit, so the store holds its own spec.

3. **The client.** A chassis page and an engine in the browser that attaches a store over HTTP, read only, checks what it fetches, and answers reads in [the one protocol](architecture/client.md#3-one-protocol).

4. **The reader component.** A component that draws a brief's prose, and [the first reader](knowledge.md#3-the-first-reader-component) built on it.

It is done when the author opens the page and reads this wiki from the store.

*Proposed, 2026-11-01.*

## 2. After the first mark

What waits, roughly in the order it stands on what comes before it. None of it is begun, and the order is a claim to be agreed or refused.

- **The fully immersive interface.** Editing in place, with the reader's own branch of a pulled store; what drew each holon, and why that component matched it, shown and edited where it stands; a context menu of actions; and the code and the JSON of anything readable where it is drawn, nothing locked away in a panel.

- **The home**, kept in the browser: what is attached, the entry, the arrangement, and reset and clear as programs.

- **Runs, visible.** Runs kept in the home and drawn as they go, like an agent session; actions a component declares, such as adding a holon, that run a program; and the harness with its completion model and tools.

- **Components as code and as data**: expressive components and layout components in TSX, and components that are data, templates.

- **The URL**, and sharing as an act.

- **OpenLight's reader**, with selections, intersection and many places.

- **Publishing**: glass's pinned builds on its own Pages, and the author's site as a store beside a client pointed at it.

- **The engine on the author's own machine**, the other engine and chassis.

- **Glass's components as a store** of their own.

*Proposed, the session's, 2026-11-01; the immersive interface, visible runs and components as code and data are the author's, 2026-10-31.*

## 3. What is open

Questions the first mark meets, and those beyond it, each to be settled when the work reaches it.

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
