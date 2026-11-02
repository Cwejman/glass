---
under: the rule
kind: brief
---

# The store

A store is where a field is kept and how it travels: a set of objects that never change, each named by what it holds, and one pointer that moves. Because nothing in it is ever rewritten, any copy of a store, anywhere, is whole and can check itself, and every state it ever had is still in it.

*The author's, 2026-11-01: holons have ids and history, and the store is glass's own, neither git nor SQLite. The shape of ref, commit, index and versions was the session's proposal, agreed by the author that day.*

## 1. Objects named by what they hold

Every object is a small piece of JSON, written in one canonical form so the same content is always the same text, and named by the SHA-256 hash of that text, as `sha256-` followed by the hash. The name proves the object: whoever fetches it hashes it again and knows it is what was asked for.

The prefix says how the name was made, so the hash can change one day without every name becoming ambiguous.

*Reasoned, the session's, 2026-11-01; canonical JSON as [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) defines it, not yet read in full here.*

## 2. From the ref down

A store holds four kinds of thing, each pointing at the next, and reading one means walking them from the top.

*Proposed by the session and agreed by the author, 2026-11-01, who named the versions the atoms.*

### 2.1 The ref says which commit is current

A ref is a name, `main`, holding the name of one commit. It is the only thing in a store that ever changes, and moving it is what publishing a new state means.

*Reasoned, the session's, 2026-11-01.*

### 2.2 A commit says how the field came to be this way

A commit is one change to the field, whole. It holds three things: the commit before it, called its parent, the index it produced, and when it was made. What it changed is the difference between its index and its parent's. Following parents back walks the whole history of the field, one change at a time.

```json
{ "kind": "commit", "parent": "sha256-b1…", "at": "2026-11-01T10:12:00Z",
  "index": "sha256-e8…" }
```

A commit does not say who made it. A change is made by a program's run, and the run records the commits it made, so the run is what connects a commit to the program behind it. The run is kept in the home of whoever ran it, which is often not the store the commit lands in, so the link runs from the run to the commit, never back.

*The author's, 2026-11-02: a commit is added to the program run that made it, so it is already connected, and there may be no need for a by. The shape and the direction of the link reasoned, the session's.*

### 2.3 The index is the whole field at one commit

An index maps every holon's id to the version it has at that commit. It holds no content itself, only which state of each holon is current, so one index is the whole field at one moment.

At glass's size one index is one object. A field large enough for that to cost can split it into a tree, so a commit rewrites only the part it touched.

*Reasoned, the session's, 2026-11-01; the split is not needed yet.*

### 2.4 A version is one holon as it stood

A version holds a holon's content, its title, data and prose, together with its id, where it stands, and the version before it. Versions are the atoms: everything else in the store only points at them.

```json
{ "kind": "version", "holon": "01JB…notes", "prev": "sha256-27…",
  "above": "01JB…root", "title": "Notes", "data": {}, "prose": "…" }
```

*Reasoned, the session's, 2026-11-01; whether where a holon stands belongs in its version or in connections of its own is [open](../plan.md#3-what-is-open).*

## 3. A change adds and never rewrites

Changing one holon writes a new version of it, whose `prev` is the old one, then a new index that differs from the last only in that holon, then a new commit whose parent is the last. The ref moves to the new commit.

Nothing old is touched. The holons that did not change are shared by both indexes, and the old commit still names the old index, which still names the old version, so the past stays whole.

*Reasoned, the session's, 2026-11-01.*

## 4. Two histories, one store

The field's history is read from commit to parent: each step one change and the state it left. A holon's history is read from version to version: every state it has had, whichever acts made them. Both are in the store already, and neither needs a log kept beside it.

*Reasoned, the session's, 2026-11-01.*

## 5. Every commit can be pinned

A commit fixes the whole field by one name, so a reader pinned to it sees exactly what was there, however far the store has moved since.

*Reasoned, the session's, 2026-11-01, on the author's question whether a whole state can be had.*

## 6. A bundle for the first visit

Fetching a whole state object by object is many small requests, so a store may also hold a bundle beside its objects: everything one commit reaches, in one file, each object in it still checked by its name. A first visit fetches the ref and one bundle. The loose objects stay the truth, and a bundle is a convenience made from them, as git's packs and IPFS's archives are.

*Reasoned, the session's, 2026-11-01.*

## 7. Laid out as files

On disk and on a host, a store is a directory, the objects fanned into folders by the first two characters of their hash so no folder grows too large:

```
store/
  refs/main                     sha256-9f2c…
  objects/9f/2c41….json         a commit
  objects/a7/03be….json         a version
  bundles/sha256-9f2c….json     optional, one commit whole
```

Any program that can read files can read a store, and any host that can serve files can serve one.

*Reasoned, the session's, 2026-11-01; the fan-out is git's.*

## 8. A format of its own

Glass's object model is its own, with only the smallest standards beneath it; the background, and why, are in the formats.

[The formats considered](formats.md)

*Proposed by the session and agreed by the author, 2026-11-01.*
