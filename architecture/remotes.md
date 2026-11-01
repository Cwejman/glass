---
under: the rule
kind: brief
---

# Remotes and publishing

A remote is a store served as plain files, and a site built on glass is one: the author's store on a static host, beside a page that loads the client pointed at it. Nothing on the host runs, so any host that serves files will do, and for now that is GitHub Pages, with nothing else to rely on.

*The author's, 2026-11-01: not wanting to rely on more infrastructure than needed to get this going, and choosing GitHub Pages.*

## 1. A store served as files

A client reads a remote the way the store is laid out: the ref, then the commit it names, then the index, then the versions it needs, each checked against its name. Objects never change, so a host may cache them for good; the ref is the one file fetched fresh.

Every object is JSON at an address of its own, so anyone can also fetch a holon's data directly, without a client. And since any client may attach any store, a remote is served with the headers that let other sites read it, which GitHub Pages is believed to send already.

*Reasoned, the session's, 2026-11-01; data fetched directly as JSON was the author's wish on [2026-10-30](../said/2026-10-30.md#43-glass). GitHub Pages' headers not checked.*

## 2. Publishing adds files and moves the ref

To publish is to upload the objects the remote does not have, which is always safe since the same object is always the same file, and then to move the ref, but only if it still names the commit the publisher started from. If someone else moved it first, nothing is lost: the publisher's commits stand in the store, and the two lines meet by a merge, which is [still open](../plan.md#3-what-is-open).

A bundle, if one is wanted, is made at publishing, from the objects, by whoever publishes.

*Reasoned, the session's, 2026-11-01.*

## 3. Loose objects ride in git

A store kept in a git repository costs almost nothing extra, because its objects are files that are only ever added. A publish is a git commit that adds the new objects and changes one line, the ref, and git keeps each object once. What git's history adds is a log of when things were published, not a second copy of the field's history.

A store packed into one file would be the opposite: every publish rewrites the whole file, and git keeps every copy. So the objects stay loose.

*Reasoned, the session's, 2026-11-01, answering the author's concern of putting commits on something that already contains commits.*

## 4. A site is a store and a pinned client

Glass and a site built on it are two repositories. Glass is the client, versioned as code, and it publishes its own builds at pinned versions on its own Pages. A site is a store, with a page that loads one pinned build of glass and gives it one default: attach this store, and boot into the entry it holds.

```
your-site/
  store/refs/main
  store/objects/…
  index.html        loads glass at a pinned version, attaching this store
```

So the site is its field, whole and with its history, and anyone who points another client at its store reads the same field. The site installs no package and builds nothing; at most a Pages workflow file publishes it as it stands.

*Of three ways the session proposed on 2026-11-01, a package, a git submodule, or loading glass from where glass publishes itself, the author chose the third, for now.*

### 4.1 Toward glass as a store

In OpenLight a module is a store, and what a store ships to draw itself is served from the store. Followed through, glass's components become holons in a store of glass's own, which a site attaches beside its content, and only a small bootstrap, the chassis and the engine, stays a plain script. Then anyone could draw a field with other components, or draw other fields with glass's.

*Reasoned, the session's, 2026-11-01; a direction, not the first step.*
