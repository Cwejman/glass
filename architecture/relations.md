---
under: the rule
kind: brief
---

# How holons relate

A holon is its identity, what it is, and its body, with a name beside them, and for a type its fields, and nothing else is stored. Every relation between holons is a reference inside a body, or a type's fields, and a reference either holds what it points at or only points. A whole is a holon whose references hold its parts, and a part may stand whole in many wholes. So the field needs no relation of its own beyond instance, and every way of reading it, as a holarchy, as namespaces or as dimensions, is the engine reading bodies.

*The author's decisions, 2026-11-02, reasoned through OpenLight's five connection kinds and tried in six simulated fields, each holding the whole of a field at once; holding said in the references themselves the author's, [2026-11-04](../said/2026-11-04.md#15-holding-said-in-the-fields-themselves), after a day weighing namespaces, dimensions and the store as one question.*

## 1. What is stored

A version stores a holon's identity, what it is an instance of, and its body. Instance is the one relation the store knows itself, because it is what gives a body its meaning: a type says what its instances hold, and the engine checks a body against it at commit. A holon may be an instance of several types.

*The author's, 2026-11-02: something is an instance of something, that makes perfect sense; the store holds everything.*

Two more are to stand beside them, out of the body, since the engine reads them whatever a holon's type: its name, as [beneath](#6-a-holon-is-named-by-itself), and, for a type, its fields, what its instances hold. The body is then only what a holon holds itself. Neither is built.

*The author's, 2026-11-05: I thought name was something first class for holons; fields goes out of the body.*

## 2. References live in bodies

Any relation a holon has to another is a reference in its body, under a key its type gives meaning to: a note's `about`, a role's `who` and `where`, a run's `program`. A reference is written the same way wherever it stands, so it is seen as one without knowing the type, by a reader or by the engine, even when the type is in a store neither has. Types say what a reference means and check it; they are never what finds it.

A reference points at a holon's identity, so it follows the holon as it changes, or it is pinned to one version, so it keeps saying what it said: a note pins the version of the brief it was written against.

*The author's, 2026-11-02: specific relations are defined by type reference. That references must be visible without types, and may be pinned, was found by every simulation that tried to do without it.*

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

Holding is the field's meaning, and the shape of a field does not decide it. A mount's offer is a set of names, each to a holon, `search` to the Search component and `favorites` to the reader's favorites, and by its shape alone it would look like a whole holding its parts. Whether a mount holds what it offers, so that it travels with what it needs, is the mount's type to say, and leans towards holding. If it holds, the offer's names are its settings' and not the names of what it holds, which a holon carries itself, as [beneath](#6-a-holon-is-named-by-itself); how the two stand together is open.

*The counter-case the session's, 2026-11-04; the lean the author's: perhaps it should hold, it makes sense, why not. Not yet decided.*

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

A holon may carry a name of its own, kept beside its identity rather than in its body, and beside its title: short and lowercase, made to be typed and written, where the title is for reading. The name is the holon's, not given by whoever holds it, so it is the same in every whole that holds it, and each whole asks only that what it holds be unique by name. Two holons named `type` can stand in the field, never in one whole.

*The author's, 2026-11-04: a holon that has no name unless you know its parent is not very holon-like, not very autonomous; the holon earns the name. Unique among what one whole holds his too: the name still has to be unique for that space, because otherwise I can't type against that; unique for that level only.*

### 6.1 An address is a route; a reference is an identity

An address is a route of names through wholes, from where the field begins: `glass/types/type` and `glass/functions/type` are two holons, so the clash between the type and the function of one name is gone. A holon held by several wholes has as many routes, `glass/wiki/the-store` and `favorites/the-store`, and is one holon, its identity its id. A whole reached by its parts' names is a namespace, and the store's root is the first of them.

A reference holds the id, never a route, so moving a holon or adding one before it changes no reference. A part's place in a list, as a brief's number, is for reading, never for linking; a link by a heading's anchor, its number and words, is what broke when the interface's eighth section was renamed.

*The author's, 2026-11-04: what forces us to think that the number is the true reference; if I add a brief in the middle I still linked by the id. Namespaces as wholes reached by names the session's, from OpenLight's paths and the store as the namespace of 2026-11-02, weighed with the author the same day.*

How a bare name is found, as `group` written in an address without its route, is open: most simply from the wholes a place says it uses. Glass's build still holds names as one flat map in each store's index, its root as the one namespace, and its address calls functions by their titles; holons carrying their own names is not built.

*The session's, 2026-11-04.*

## 7. Within a holon

What is finer than a holon need not be one. A holon of its own gives an identity anything can point at, a history of versions, a place in many wholes and in the field's index; a paragraph, a word or a list in a brief needs at most the first, and text being written has no identity that lasts as a holon's must: a sentence rewritten or split, it is never clear which is the one it was. So a holon is broken out when it needs a life of its own, and everything finer is its interior.

*The author's question, 2026-11-05: when do we need to break a holon into multiple holons, or should we create virtual spaces for holons, nested universes that you don't clutter unless you care for them. The line drawn the session's, to which he said most of that makes sense; the interior that follows is proposed, not yet ratified: he liked it, and found it strange territory.*

### 7.1 Holons at a smaller scale

An element of a holon's interior has the shape of a holon at a smaller scale: an id of its own, unique within the holon it stands in, written `$id`; what it is an instance of, as references to types, written `{ "$ref": … }` as any reference in a body is, where a version holds bare ids; and a body, checked against those types at commit as any holon's is. Its type may be fixed by what holds it, as a brief's prose is [Paragraphs](../knowledge.md#21-prose-is-a-list-of-typed-elements) unless an element says otherwise, so it is said only where it differs. Each element brings its own small type, which is what keeps a deep structure typed: no type knows more than its own level.

An interior element is in no index as a holon of its own and travels with its holon. The day it needs a life of its own it is lifted, given an identity in the field and versions, and keeps what it already is.

*The author's, 2026-11-05: if it is interior, do we work with reserved JSON names, for we would have no type structure anymore; can we even type such structures. The shape at a smaller scale the session's answer, shown him in a piece of the store brief.*

### 7.2 A reference may point within

A reference may name an element within a holon, `{ "$ref": holon, "within": "a2" }`, pinned to a version when it should keep saying what it said. So a comment on a word is a holon of its own, in its writer's home, pointing in, and the word it is about is never made a holon. Every element has an id, so adding and moving others loses no address; text inside an element is addressed through its element, by its words and where they stand, and a word whose meaning is to last is made an element.

*The author's, 2026-11-05: to mark a word and add a comment on it, the word needs to be addressable; ids are useful, because you can add and shift and they don't lose the address. What has an address, and how, the session's.*

Two forms are added to what the substrate reads in a body: an element, and a reference within. A reference that holds may stand wherever a reference may, as a [Part](../knowledge.md#21-prose-is-a-list-of-typed-elements) in prose does, not only in a field of its own. None of it is built.

*The session's, 2026-11-05; the author liked references standing anywhere, though he had not thought they would.*

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

Since every relation is a reference in a body, or in a type's fields, the engine keeps one index over the bodies and fields of every store it reads: which values and references appear where. It is the engine's own, not the store's index of which version each holon is at. From any holon it answers what holds it, what it holds, what points at it, grouped by the type and key that point, and what has a given value. Visits by page, by day or by browser are answers of that index, so many things that look like dimensions are values.

Belonging is read upward through holding references alone: from any holon, every whole that holds it, and the wholes above those. A route down always ends; reading upward can meet a cycle, a whole that comes to hold itself through others, and the engine guards against it rather than forbid it.

The index belongs to the engine, so each engine sees its own: the author's engine sees the visits and runs in his home pointing at a brief, a reader's engine sees their own notes on it. Whether a store should ship an index beside its objects is [open](../plan.md#3-what-is-open).

*Reasoned, the session's, from the simulations, 2026-11-02; the author's, the same day: standing on someone's knowledge you ought to see what connects to it. Cycles not a problem as long as you treat for it, the author's, 2026-11-04.*

## 10. What is open

What the days of 2026-11-04 and 2026-11-05 did not settle, each to be weighed when the work reaches it:

- **How far a dimension's mark reaches**, now that being one is the brief's own schema, as [knowledge](../knowledge.md#11-a-brief-may-be-a-dimension) tells.
- **The interior of a holon**, as [above](#7-within-a-holon), proposed and not yet ratified.
- **A single owner**, left open on purpose, as [above](#5-a-part-stands-whole-in-many-wholes).
- **Whether a mount holds what it offers**, and how the offer's names stand beside the names holons carry.
- **How a bare name is found.**
- **Lifetime**: whether a holon nothing holds should ever leave the field on its own. Set aside.

*The author's, 2026-11-04 and 2026-11-05.*
