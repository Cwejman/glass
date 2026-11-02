---
under: the rule
kind: brief
---

# The code

Glass's code is laid out as its primitives stand: the store, the engine on it, the interface on the engine, and the birth that brings files into a store. The field glass ships, its types and its components, lives beside the code in `field/`, and is born into the store as holons, so what draws the wiki is read from the same store as the wiki.

*The session's, 2026-11-03.*

## 1. Where each part lives

- `src/store/`: canonical JSON, names, ids, the objects and the store over a backend: in memory, as files, or served over HTTP. The store's format is fixed by `vectors/`, made apart from this code.
- `src/engine/`: the engine, the references it finds in bodies, the types it judges by, pulling a served store, the home in the browser's storage, the protocol, and the worker it runs in.
- `src/interface/`: the chassis, the interface's end of the protocol, and the interface that mounts what the layout names.
- `src/birth/`: reading the wiki's files under the rule, and committing them with the field into `site/store/`.
- `field/`: the types as JSON, each field said in prose, and the components as code, declared in `components.json`.
- `site/`: the page, the built client, and the store, as a static host serves them.

*The session's, 2026-11-03.*

## 2. How it is run

Everything runs with [Bun](https://bun.sh).

- `bun test` runs every test, the store's vectors among them, and `bun run check` checks the types.
- `bun run birth` births the wiki and the field into `site/store/` as a commit, when anything changed.
- `bun run build` builds the chassis and the engine into `site/`.
- `bun run serve` serves `site/` on this machine, at `http://127.0.0.1:4330/`.

After changing the wiki or a component, birth it; after changing the engine or the interface, build. The built client is not kept in git; the store is.

*The session's, 2026-11-03.*
