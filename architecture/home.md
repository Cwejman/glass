---
under: the rule
kind: brief
---

# The home

The engine in the client has a field of its own, its home, kept in the browser so a reload loses nothing. Everything the reader does is kept there, apart from the stores they pulled: what is attached, how they arrange what they see, the programs they run. The engine reads the home and the pulled stores as one field, and writes each change to where it belongs.

*The author's, 2026-11-01: the engine you have locally has its own field, and it is not mixing with the one which is public.*

## 1. What the home holds

The home is a store like any other, written by the engine and kept in the browser's own storage. It holds five things:

- **What is attached**: each store, where it is fetched from, which ref, whether pinned to one commit, and whether it may be written.

- **The entry**: the root mounts the client boots into, at first the one the attached store ships.

- **The arrangement**: the layout as the reader has it now.

- **The runs**: every program the reader's engine has run.

- **The reader's branches**: their own commits on the stores they pulled, as [beneath](#42-data-belongs-to-its-source).

It is the same as an engine's home directory on one's own machine, holding what it attaches and what it mounts at its root.

*The author's, 2026-11-01; the home as a store with its attachments and its entry is OpenLight's, where the arrangement is called the session.*

## 2. Pulled stores are read, never mixed

An attached store is read as part of the field and never written into. Someone else's runs are not in it and are not wanted, and the reader's own runs go to the home, so what was published stays exactly what was published.

*The author's, 2026-11-01: do you care about the runs that someone else did?*

## 3. Some places are projections

The engine shows some things as places that are not holons in any store: a store's commits, what is attached, whether a store is behind the host it was fetched from. Commits are objects in the store, but they are not holons, and the engine draws them as a place when one is read. Such a place reads and draws like any other and holds nothing of its own.

*The author's, 2026-11-01: the engine sometimes projects things, like commits, which are not things in the field per se. Projected places are OpenLight's.*

## 4. Layout and data are partitioned

Editing the layout and editing the data are different acts, so they land in different places.

*The author's, 2026-11-01: there is a difference between editing the data and editing the layout; let's say that layout is partitioned to local.*

### 4.1 Layout belongs to whoever is looking

How things are drawn, which component draws a holon and how places are arranged, is how the reader looks at the field, so changing it never touches the store. The arrangement starts as the one the store ships, and the reader follows the author's changes to it until they change it themselves; from then on they hold their own copy in the home.

*The partition the author's, 2026-11-01; following the store's arrangement until the first change is the session's proposal, from OpenLight's desktop, where the session is the writable home of the arrangement.*

### 4.2 Data belongs to its source

A holon's title, prose and data are what the store says, so changing them changes the source. The change is a commit on the reader's own branch of the pulled store, kept in the home. On a reload the reader stands on their branch or on the store's head, both always there, and one day a branch can be offered back.

*Reasoned, the session's, 2026-11-01, answering the author's question of whether a reload loads the public data or the persisted data. In OpenLight, editing what you only read is a clone attached for writing, which its object model was meant to replace.*

## 5. Everything is programs and places

Governing the home is done by programs, judged by the engine like any act: resetting the arrangement, clearing what is local, attaching another store, pulling the latest. What the reader stands on, which store, which commit, whether behind, is a place, drawn by a component like anything else. Nothing is managed from outside the field.

*The author's, 2026-11-01: there is no special chrome on top, it's all first-class native, as if Unix were built on programs and files.*

## 6. The history stack is the arrangement's commits

Every change to the arrangement is a commit, so the arrangement already has a history. Going back and forward walks it, and the browser's own back and forward are one more way of walking it, translated by the chassis. A reload restores the arrangement as it was left.

*Reasoned, the session's, 2026-11-01, answering the author's question of what a virtual history stack means.*

## 7. When the shape of state changes

What is kept in the home is kept in the shape the engine wrote it in, and when that shape changes, what is kept may stop fitting. The floor is that the home is typed and reset is a program, so the reader is never stuck. How kept state follows a change of shape is open, as it is in OpenLight.

*The author's concern, 2026-11-01; open.*
