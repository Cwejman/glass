---
under: the rule
kind: brief
---

# How holons relate

A holon is its identity, what it is, and its body, with a name beside them, and for a type its mould, and nothing else is stored. Every relation between holons is a reference inside a body, or a type's mould, and a reference either holds what it points at or only points. A whole is a holon whose references hold its parts, and a part may stand whole in many wholes. So the field needs no relation of its own beyond instance, and every way of reading it, as a holarchy, as namespaces or as dimensions, is the engine reading bodies.

*The author's decisions, 2026-11-02, reasoned through OpenLight's five connection kinds and tried in six simulated fields, each holding the whole of a field at once; holding said in the references themselves the author's, [2026-11-04](../said/2026-11-04.md#15-holding-said-in-the-fields-themselves), after a day weighing namespaces, dimensions and the store as one question.*

## 1. What is stored

A version stores a holon's identity, what it is an instance of, and its body. Instance is the one relation the store knows itself, because it is what gives a body its meaning: a type says what its instances hold, and the engine checks a body against it at commit. A holon may be an instance of several types.

*The author's, 2026-11-02: something is an instance of something, that makes perfect sense; the store holds everything.*

Two more are to stand beside them, out of the body, since the engine reads them whatever a holon's type: its name, as [beneath](#6-a-holon-is-named-by-itself), and, for a type, its mould, what its instances hold. The body is then only what a holon holds itself. Neither is built.

*The author's, 2026-11-05: I thought name was something first class for holons; fields goes out of the body; mould, for now, for a single word with the ontological meaning of a cast, but a cast for children.*

## 2. References live in bodies

Any relation a holon has to another is a reference in its body, under a key its type gives meaning to: a note's `about`, a role's `who` and `where`, a run's `program`. A reference is written the same way wherever it stands, so it is seen as one without knowing the type, by a reader or by the engine, even when the type is in a store neither has. Types say what a reference means and check it; they are never what finds it.

A reference points at a holon's identity, so it follows the holon as it changes, or it is pinned to one version, so it keeps saying what it said: a note pins the version of the brief it was written against.

*The author's, 2026-11-02: specific relations are defined by type reference. That references must be visible without types, and may be pinned, was found by every simulation that tried to do without it.*

Glass works on top of JSON rather than in it: a syntax of its own laid on objects, so it could be specified without JSON at all, JSON being one way to write it down. Inside a body, what is glass's is known by a leading `$`, and everything else is the holon's own: a reference is `$ref`, and would be pinned by `$at` and say it holds by `$holds`. As built, a pin is written `@`, and holding is not yet said at all. A version's own places, its id, instance, name and body, and a mould's words, are the store's and carry no `$`.

*The author's, 2026-11-05: we do not work in JSON, we work on top of JSON, creating our own syntax upon objects having reserved internal fields; perhaps id is one such thing, just like references are; one could spec the JSON without the JSON. The `$` for all of them, `$at` for `@` and the name `$holds`, the session's proposal, not yet answered.*

## 3. A reference holds or points

A reference does one of two things. It holds what it points at, making it a part of the holon it stands in, or it only points, as a mention, a setting or a source does. Holding has a direction by its nature: it runs from the whole to its part, so no reference needs to say which way it goes.

*The author's, 2026-11-04: we give a directionality, owns or doesn't own, into the references and the fields themselves; glass went away from OpenLight's kinds of relation and back into the body, and this keeps it there.*

None of this is built yet. The engine finds every reference alike, a mention in prose among them, so what holds, Children of, Parents of and the field's roots all read every reference as holding; once holding is said, they read holding alone, and the roots become what nothing holds.

*The session's, 2026-11-04, from the code; the decisions of this section a spec, not yet built.*

### 3.1 Holding is a set or a list

A field that holds is a set of references, or a list when its parts have an order, as a brief's parts and an album's tracks do. A place in a list may carry data of its own, a track's disc and number, and is still held. There is no third form: a set says what the whole holds, and a list says it in order.

*The author's, 2026-11-04: when you hold something it's a set, but you can hold something as a list; each still has its own name, but now they have order; there is no map. A place carrying data of its own carried from the decisions of 2026-11-02, found by the simulations.*

### 3.2 A type fixes it, or the reference says it

Any holon may reference, typed or not. Untyped is no lesser state: it is how a thing is first made, before one knows what one is making. Without a type, each reference says for itself whether it holds. A type, once written, fixes it for the fields it declares, so its instances need not say it again; that is what writing a type preselects. Where a type is silent on a field, the reference speaks, and where both speak they must agree, or the commit is refused, as a body that does not fit its type is.

*The author's, 2026-11-04: types are not mandatory to have references in your fields; if you do write a type, you pre-select, and you're locked to it; if it's not typed, you're free for each field to specify its contents, its name, and whether it holds or points. Refusing a disagreement the session's, as glass refuses any body that does not fit.*

Holding is the field's meaning, and the shape of a field does not decide it. A mount's offer is a set of names, each to a holon, `search` to the Search component and `favorites` to the reader's favorites, and by its shape alone it would look like a whole holding its parts. What a mount gives may be written in it, an expression that is the mount's own, so neither held nor pointed at; or it names a function already kept, and points at it. Either way the mount works. A mount that points at what it offers names it under its settings' own names, so the question of the offer's names beside the names holons carry dissolves with it.

*The counter-case the session's, 2026-11-04; the author's, 2026-11-05: if it already exists, it makes sense that it points to it, but ultimately it doesn't really matter, the mount works regardless. An expression written in a mount as its own, neither held nor pointed at, the session's answer to his question whether there is then no holding or pointing.*

### 3.3 Types own nothing

Being an instance of a type says what a holon is, never where it stands. A type holds none of its instances: they are a set the engine reads, from every store, with no order and no names. Holons of a kind that are to be found together are held by a whole made for it, as glass's functions would be by one holon holding them all.

*The author's, 2026-11-04: types don't own anything; you create namespaces if you want to group your instances. A type placing its children was double duty, and smelly.*

### 3.4 Prose holds by its lone links, for now

In a brief written as Markdown, a link standing alone in a paragraph places a part there, with the sentence before it saying why, and a link inside a sentence only mentions. That is a convention read from the text, not a reference the store knows, and it lasts as long as briefs are written as files: when glass can show its files and its history itself, the briefs are written natively, and their parts are references that hold.

*The author's, 2026-11-04: using links in prose like that was a kind of hack, fine for the moment; the birth is to be scrapped once glass can show the files and their relation to the field. How briefs hold their parts, and prose made native, weighed the next day in [knowledge](../knowledge.md#2-prose-made-native).*

## 4. Who holds a relation is who can write

A relation is held by the holon that can be written, and across stores that answer is never in doubt: a reader's notes, their reading list, their runs and their layout all sit in their own home and point into stores they only read, and as glass is built nothing writes into a pulled store; whether a source may be written is its own to say, as [the store](store.md#10-every-source-is-an-integration) tells. Within one store the side that owns the order holds it: a brief its parts, an album its tracks, a playlist its entries. An entry of something kept by time points at what keeps it instead, since such entries are ordered by a value, the day said or the moment visited, so adding one writes one holon and touches nothing else.

A relation that has a time or attributes of its own is a holon of its own, holding references: a role, who, where, as what, from and to; a run, which program, given what. A visit is one such, when and what one looked at, kept as an entry in the reader's history rather than a holon of its own, as [the interface](interface.md#8-moving-is-a-new-address) tells; whether such entries are holons each is [open](../plan.md#3-what-is-open).

*The author's, 2026-11-02: you can't manipulate someone else's knowledge, but you define your own routes over it; a brief holds its children, a visit belongs instead. The rest found by the simulations.*

## 5. A part stands whole in many wholes

A whole says what it holds, and in what order. A part may be held by many wholes, each holding it as a part and not as a link: an audience holds the workflows that pertain to it, though they stand in the tree of workflows as well, and favorites hold what is placed there. Whether one of the wholes is its home, as the tree may matter more to a workflow than the audience does, is the question of a single owner, below.

What a whole is, its type says, and a reader reads it there: favorites gather what lives elsewhere, so what one placed there is shown as placed, not as what the thing is part of.

A part is whole in itself wherever it is taken, so a whole taken away with its parts is whole, and one taken without the wholes that also hold its parts loses only what those wholes said.

That one holon has one owner, as OpenLight held, is left open on purpose. Nothing in the store needs it and nothing today asks for it, and starting with many owners can be narrowed later without breaking what was written, where starting with one could not be widened. Whoever meets a reason for a single owner meets it here.

*Favorites as a place for things that exist from elsewhere, a shortcut, the author's, 2026-11-04, its type saying so the session's. Many owners the author's lean, 2026-11-04, from open-endedness and resonance with reality, which he names a gut feeling; that the store gives no reason to forbid it agreed the same day; the single owner left open by his word, so that it's clear in case we ever stumble upon the answer or someone else does. Reversibility the session's reason.*

## 6. A holon is named by itself

A holon may carry a name of its own, kept beside its identity rather than in its body, and beside its title: short and lowercase, made to be typed and written, where the title is for reading. The name is the holon's, not given by whoever holds it, so it is the same in every whole that holds it, and each whole asks only that what it holds be unique by name. Two holons named `brief` can stand in the field, the type and the component that draws it, never in one whole.

*The author's, 2026-11-04: a holon that has no name unless you know its parent is not very holon-like, not very autonomous; the holon earns the name. Unique among what one whole holds his too: the name still has to be unique for that space, because otherwise I can't type against that; unique for that level only.*

### 6.1 An address is a route; a reference is an identity

An address is a route of names through wholes, from where the field begins: `glass/types/brief` and `glass/components/brief` are two holons, so a clash of one name between a type and a component, or a type and a function, is gone. A holon held by several wholes has as many routes, `glass/wiki/the-store` and `favorites/the-store`, and is one holon, its identity its id. A whole reached by its parts' names is a namespace, and the store's root is the first of them.

A reference holds the id, never a route, so moving a holon or adding one before it changes no reference. A part's place in a list, as a brief's number, is for reading, never for linking; a link by a heading's anchor, its number and words, is what broke when the interface's eighth section was renamed.

*The author's, 2026-11-04: what forces us to think that the number is the true reference; if I add a brief in the middle I still linked by the id. Namespaces as wholes reached by names the session's, from OpenLight's paths and the store as the namespace of 2026-11-02, weighed with the author the same day.*

How a bare name is found, as `group` written in an address without its route, is open: one resolves from the location one is in, and may be in several namespaces, most simply the wholes a place says it uses; what it means for the URL is not yet known. Glass's build still holds names as one flat map in each store's index, its root as the one namespace, and its address calls functions by their titles; holons carrying their own names is not built.

*The session's, 2026-11-04; resolving from where one is, in several namespaces, the author's, 2026-11-05.*

## 7. What is finer than a holon

A brief's paragraphs, a list in it, an image, a word that stands for something: each is a holon of its own, held by the brief, typed, and drawn by the component its type finds. Inside them is only what is not a holon: values, shaped by the holon's mould, text and the references among it, an image's caption, code's language. So the field holds holons and values within them, and nothing between.

*The author's, 2026-11-05: good, that leaves us with indexing; his critiques of the interior the session first proposed decided it, and the count of holons it costs is still to be measured.*

### 7.1 Why not an interior

A holon's interior was first proposed: elements with ids of their own inside a body, typed, pointed into with `within`.

To keep it typed, so that a brief's prose could say it holds only typed things and not any JSON, the interior had to be a second kind of holon, a primitive of its own.

Its main ground, that a paragraph needs no versions of its own, failed against what the author wants of history: an act kept at the fidelity of the act, finer than git, which commits whole files. That text under editing has no lasting identity, a sentence split and which half is it, holds for an interior's ids as much as for holons, so it decided nothing.

*The author's, 2026-11-05: if a brief takes a list of anything, any JSON can be typed and things can't be matched, so it has to say its contents are interior holons, a new primitive; a commit is bloat in a way, and an act that changes something you want kept at the fidelity of that act; is there any reason to think the internals should really be exposed holons, namespaced, the namespace simplifying the internals to the outside. Weighed again by the session, which had argued for the interior and found its reasons wrong, or not telling, or unmeasured.*

### 7.2 The whole keeps them out of sight

A brief's paragraphs are its parts, held by it, so the field's roots, what nothing holds, never show them: they are seen in the brief, or when asked for. The whole is the namespace that keeps its insides from cluttering the field, and nothing beside holding is needed for it. What is gained is what any holon has: an edit to one paragraph writes a version of that paragraph only, its history is its own, a comment points at it by its identity, and a word whose meaning should last is a holon of its own, a Term.

*The session's, 2026-11-05, answering the author's nested universes that you don't clutter unless you care for them. What it costs, a dozen holons a brief and the wiki in thousands, and more objects to a commit, is to be measured, with the index in view. None of it is built.*

## 8. What was let go

OpenLight had five connection kinds, and three of them are not carried as kinds of their own.

*Reasoned with the author, 2026-11-02.*

### 8.a Ownership as a relation apart

Ownership in OpenLight was a stored placement, beside bodies: a single home, a name within it, and paths. On 2026-11-02 it was let go and the store made the namespace. On 2026-11-04 it came back in the body: holding is a reference that holds, a part may be held by many wholes, and names and routes are the holons' own. What was let go is ownership as a relation stored apart, and the single home.

*The author's, 2026-11-02, and [late on 2026-11-03](../said/2026-11-03.md#25-what-consumes-from-everything): we are back to one of the most prominent decisions around the primitives themselves, the one we leaned on simplicity for, dropping ownership and relates; a store is a namespace, and namespacing allows nested stores in a way. Then 2026-11-04: Neither OpenLight's single owner nor the rule's several homes was taken for granted: we need to think for ourselves and be autonomous in our reasoning.*

### 8.b Relates

Relates said a holon is about another, published into that other's place. Whatever a holon is about, its type can say with a reference, and what it is about is then seen from the other side by the engine's index, without writing there.

*The author's, 2026-11-02: is there really anything lost by dropping relates?*

### 8.c Universal membership and composition

A relation every holon has regardless of type, placing itself in a collection or listing its parts, was tried and let go. It had no room for what a placement carries, such as a playlist entry's moment or a brief's sentence in its second place, and placing oneself into a whole merged a reader's note with a chapter of the whole. A whole still says what it holds; the part never says it of itself.

*Found by the simulations, 2026-11-02.*

## 9. The engine reads it all

Since every relation is a reference in a body, or in a type's mould, the engine keeps one index over the bodies and moulds of every store it reads: which values and references appear where. It is the engine's own, not the store's index of which version each holon is at. From any holon it answers what holds it, what it holds, what points at it, grouped by the type and key that point, and what has a given value. Visits by page, by day or by browser are answers of that index, so many things that look like dimensions are values.

Belonging is read upward through holding references alone: from any holon, every whole that holds it, and the wholes above those. A route down always ends; reading upward can meet a cycle, a whole that comes to hold itself through others, and the engine guards against it rather than forbid it.

The index belongs to the engine, so each engine sees its own: the author's engine sees the visits and runs in his home pointing at a brief, a reader's engine sees their own notes on it. Whether a store should ship an index beside its objects is [open](../plan.md#3-what-is-open).

*Reasoned, the session's, from the simulations, 2026-11-02; the author's, the same day: standing on someone's knowledge you ought to see what connects to it. Cycles not a problem as long as you treat for it, the author's, 2026-11-04.*

## 10. What is open

What the days of 2026-11-04 and 2026-11-05 did not settle, each to be weighed when the work reaches it:

- **Whether what is beneath a dimension may refuse its mark**, as [knowledge](../knowledge.md#11-a-brief-may-be-a-dimension) leaves it.
- **What a holon per paragraph costs**, as [above](#72-the-whole-keeps-them-out-of-sight), to be measured.
- **A single owner**, left open on purpose, as [above](#5-a-part-stands-whole-in-many-wholes).
- **How a bare name is found**: from where one stands, and a place may stand in several namespaces.
- **Lifetime**: whether a holon nothing holds should ever leave the field on its own. Set aside.

*The author's, 2026-11-04 and 2026-11-05.*
