---
under: the rule
kind: brief
---

# How holons relate

A holon is its identity, what it is, and its body, and nothing else is stored. Every relation between holons is a reference inside a body, held by whichever side can write it, and part and whole is read from the whole's body. So the field needs no relation of its own beyond instance, and every way of reading it, as a holarchy or as dimensions, is the engine reading bodies.

*The author's decisions, 2026-11-02, reasoned through OpenLight's five connection kinds and tried in six simulated fields, each holding the whole of a field at once.*

## 1. What is stored

A version stores a holon's identity, what it is an instance of, and its body. Instance is the one relation the store knows itself, because it is what gives a body its meaning: a type says what its instances hold, and the engine checks a body against it at commit. A holon may be an instance of several types.

*The author's, 2026-11-02: something is an instance of something, that makes perfect sense; the store holds everything.*

## 2. References live in bodies

Any relation a holon has to another is a reference in its body, under a key its type gives meaning to: a note's `about`, a role's `who` and `where`, a visit's `page`. A reference is written the same way wherever it stands, so it is seen as one without knowing the type, by a reader or by the engine, even when the type is in a store neither has. Types say what a reference means and check it; they are never what finds it.

A reference points at a holon's identity, so it follows the holon as it changes, or it is pinned to one version, so it keeps saying what it said: a note pins the version of the brief it was written against.

*The author's, 2026-11-02: specific relations are defined by type reference. That references must be visible without types, and may be pinned, was found by every simulation that tried to do without it.*

## 3. Who holds a relation is who can write

A relation is held by the holon that can be written, and across stores that answer is never in doubt: a reader's notes, their reading list, their runs and their layout all sit in their own home and point into stores they only read, and nothing ever writes into a pulled store. Within one store the side that owns the order holds it: a brief its parts, an album its tracks, a playlist its entries.

A relation that has a time or attributes of its own is a holon of its own, holding references: a role, who, where, as what, from and to; a visit, which page, when, from what browser; a run, which program, given what.

*The author's, 2026-11-02: you can't manipulate someone else's knowledge, but you define your own routes over it. The rest found by the simulations.*

## 4. Part and whole are read from the whole

A whole says what it holds, and in what order. In prose, the rule already says how: a link standing alone in a paragraph places a part there, with the sentence before it saying why, and a link inside a sentence only mentions. Elsewhere a whole holds its parts as a typed list, and each place in the list may carry data of its own: a track's disc and number on an album, the moment it was added to a playlist.

A part may stand in many wholes, each with its own sentence or its own place. And an entry of something kept by time holds a reference to what keeps it instead, since such entries are ordered by a value, the day said or the moment visited, so adding one writes one holon and touches nothing else.

*The author's, 2026-11-02: a brief holds its children, a visit belongs instead. The lone link as the part carried from the rule's practice.*

## 5. What was let go

OpenLight had five connection kinds, and three of them are not carried.

*Reasoned with the author, 2026-11-02.*

### 5.a Ownership

Ownership gave a single home, a name within it, and paths. A holon may now stand in many wholes, so a single home is gone, and the store is the namespace: a name is unique within its store and resolves to an identity, so references never break when a name changes. What a thing is was never ownership's to say; it is instance, wherever the thing lives.

*The author's, 2026-11-02: namespace is the possibility of where, and what a program implements is another thing.*

### 5.b Relates

Relates said a holon is about another, published into that other's place. Whatever a holon is about, its type can say with a reference, and what it is about is then seen from the other side by the engine's index, without writing there.

*The author's, 2026-11-02: is there really anything lost by dropping relates?*

### 5.c Universal membership and composition

A relation every holon has regardless of type, placing itself in a collection or listing its parts, was tried and let go. It had no room for what a placement carries, such as a playlist entry's moment or a brief's sentence in its second place, and placing oneself into a whole merged a reader's note with a chapter of the whole.

*Found by the simulations, 2026-11-02.*

## 6. The engine reads it all

Since every relation is a reference in a body, the engine keeps one index over the bodies of every store it reads: which values and references appear where. From any holon it answers what holds it, what it holds, what points at it, grouped by the type and key that point, and what has a given value. Visits by page, by day or by browser are answers of that index, so many things that look like dimensions are values.

The index belongs to the engine, so each engine sees its own: the author's engine sees the visits and runs in his home pointing at a brief, a reader's engine sees their own notes on it. Whether a store should ship an index beside its objects is [open](../plan.md#3-what-is-open).

*Reasoned, the session's, from the simulations, 2026-11-02; the author's, the same day: standing on someone's knowledge you ought to see what connects to it.*
