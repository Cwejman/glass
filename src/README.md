---
under: the rule
kind: brief
---

# The code

Glass's code is laid out as its primitives stand: the store, the engine on it, the interface on the engine, and the birth that brings files into a store. It is data and functions over it: nothing is a class, the core is pure, and effects happen only at the edges, the page, the browser's storage, the network and the files. Beside it stand the other kinds the repository holds, each in its own place: the knowledge, the field glass ships, the store's contract, and the site a host serves.

*The session's, 2026-11-03.*

## 1. Where each part lives

The code, in `src/`:

- `src/store/`: canonical JSON, names, ids and the objects; objects checked before they are trusted; the index tree; and the store over a backend, in memory, as files, or served over HTTP. The store's format is fixed by `vectors/`, made apart from this code.
- `src/engine/`: the field as a value and what reads and judges it, the engine that keeps it, the references it finds in bodies, the types it judges by, pulling a served store, the home in the browser's storage, the protocol, and the worker it runs in.
- `src/interface/`: the contract every component draws against, the interface's end of the protocol, the materials laid on the page, the drawing of holons into hosts, by code or by template, the root drawn where the page's address says, the syntax that says an expression as text and reads it back, and the chassis that starts it all.
- `src/birth/`: reading the wiki's files under the rule, what the field's holons are made from what the files hold, and committing them into `site/store/`.

Beside it:

- The knowledge: this wiki's files, `architecture/` and `said/`, born into the store.
- `field/`: the field glass ships, born into the store beside the knowledge: the types as JSON, each field said in prose; the components, holons that hold code, each declaring itself in its own module, or data, a template in its own JSON file; the entry, the mount a client boots into, in `entry.json`; and the materials everything is drawn with, declared in `materials.json`.
- `vectors/`: the store's contract, in no language, which any implementation answers to.
- `site/`: the page, the built client, and the store, as a static host serves them.

The code and the field are kept as files in git, their source and their history; born into the store, they are holons too.

*The session's, 2026-11-03.*

## 2. How it is run

Everything runs with [Bun](https://bun.sh).

- `bun test` runs every test, the store's vectors among them; `bun run check` checks the types, and `bun run format` lays every file in the one form the code is kept in.
- `bun run birth` births the wiki and the field into `site/store/` as a commit, when anything changed.
- `bun run build` declares the bodies of the field's types for the components, and builds the chassis and the engine into `site/`.
- `bun run serve` serves `site/` on this machine, at `http://127.0.0.1:4330/`.

After changing the wiki or a component, birth it; after changing the engine or the interface, build. The built client is not kept in git; the store is.

*The session's, 2026-11-03.*
