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

Beside it, also in `src/`:

- `src/field/`: the field glass shipped, as the birth read it: types as JSON, components as modules or templates, the entry and the materials.
- `src/store/vectors/`: the store's contract, in no language, which any implementation answers to.
- `src/site/`: the page; the build writes it, with the built client, into `site/`, which is output only.
- `src/tools/`: reading the store from its blocks and adding commits to it, and the format's vectors.

The knowledge is no longer here: since 2026-11-06 it is holons in `store/`, and the birth that read it from markdown has ended.

*The session's, 2026-11-03.*

## 2. How it is run

Everything runs with [Bun](https://bun.sh).

- `bun test` runs every test, the store's vectors among them; `bun run check` checks the types, and `bun run format` lays every file in the one form the code is kept in.
- `bun run birth` is the old way in: it read the wiki's markdown, whose files are gone, and the field into `site/store/` for the old client. The real store is `store/`, added to through `src/tools/`.
- `bun run build` declares the bodies of the field's types for the components, and builds the chassis and the engine into `site/`.
- `bun run serve` serves `site/` on this machine, at `http://127.0.0.1:4330/`.

After changing the engine or the interface, build. The built client is not kept in git; the store is. All of this speaks of the old form of the store until the code is brought to the blocks, as the root README tells.

*The session's, 2026-11-03.*
