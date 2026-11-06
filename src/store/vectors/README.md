---
under: the rule
kind: brief
---

# The store's vectors

What a store is, written as cases any implementation must pass, in any language. An implementation that writes these objects, gives them these names and reads them back is writing glass's store; nothing else about it matters.

*The session's, 2026-11-03, on the author's wish that the store be built tests first and stand apart from any code.*

## 1. Canonical text

`canonical.json` holds JSON texts, the one canonical text each must become, as [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) defines it, and the name of that text: `sha256-` and its SHA-256 in hex. Two cases are the RFC's own examples.

*The RFC's examples copied from its sections 3.2.2 and 3.2.3.*

## 2. Commits on a store

`store.json` holds changes applied in order to an empty store. After each, the ref `main` names the commit, and the store has gained exactly the objects listed, each at its name: the first commit births three holons and gives a name; the second changes one holon and leaves another as it was, which gains no version; the third passes 64 holons, and the index's leaf becomes a branch.

*The session's, 2026-11-03.*

## 3. How they are made

`make.ts` builds every object by hand and names it with the system's `shasum`, sharing no code with glass, so passing the vectors means agreeing with something other than oneself. Run it with `bun vectors/make.ts`.

*The session's, 2026-11-03.*
