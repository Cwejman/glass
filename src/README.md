---
under: the rule
kind: brief
---

# The code

Glass's code is laid out as its primitives stand: the store, the engine on it, the interface on the engine, and the birth that brings files into a store. It is data and functions over it: nothing is a class, the core is pure, and effects happen only at the edges, the page, the browser's storage, the network and the files. Beside it stand the other kinds the repository holds, each in its own place: the knowledge, the field glass ships, the store's contract, and the site a host serves.

*The session's, 2026-11-03.*

## 1. Where each part lives

The code, in `src/`:

- `src/store/`: the store's format, one implementation over plain files, whether a folder, a static host or the browser's storage. Canonical JSON, names, the log and its checkpoints, blocks, commits and landing. The format is fixed by `vectors/`, made apart from this code.
- `src/engine/`: the field as a value and what reads and judges it. References and whether they hold, moulds and what they check, expressions over everything, the engine that keeps the home, the protocol, and the worker it runs in.
- `src/interface/`: the contract every component draws against, the interface's end of the protocol, finding a component, drawing slots, the syntax and the address that say where one looks, the root, and the chassis that starts it all.

Beside it, also in `src/`:

- `src/field/`: what glass ships, as sources: types as JSON, components as modules, functions, kinds and the material. `make.ts` makes them into `store/glass/`.
- `src/site/`: the page; the build writes it, with the built client and the stores, into `site/`, which is output only.
- `src/tools/`: reading the stores from this machine and adding to them.

The knowledge is not here: since 2026-11-06 it is holons in `store/`.

*The session's, 2026-11-03.*

## 2. How it is run

Everything runs with [Bun](https://bun.sh).

- `bun test` runs every test, the store's vectors among them; `bun run check` checks the types, and `bun run format` lays every file in the one form the code is kept in.
- `bun run field` makes `store/glass/` from `src/field/`. A holon that has not changed is not written again.
- `bun run build` builds the chassis and the engine, and copies the stores, into `site/`.
- `bun run serve` serves `site/` on this machine, at `http://127.0.0.1:4330/`.

After changing a component, make the field. After changing the engine or the interface, build. The built client is not kept in git; the store is.

*The session's, 2026-11-03.*
