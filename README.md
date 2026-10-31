# glass

A field of holons, and an engine that holds it. This is where Jona Cwejman is online, and it runs as itself on your own machine.

```bash
bun install
bun start
```

Then open http://localhost:4321, and read the whole field at http://localhost:4321/~/.

## What is here

- **The field**, in `field.db`: every holon in SQLite, and every change to it as a commit that says by whom, when and what it touched. [src/field.ts](src/field.ts)
- **The engine** holds the field, serves it as data at `/field`, tells every open page of each commit, runs programs, and carries out their effects only where the field declares itself open to them. Every request that reaches it is kept as a visit beneath `/traffic`: when, where to, from where, what kind of browser, never who. [src/engine.ts](src/engine.ts)
- **The interface** is components in Solid TSX: layout components that hold mounts, expressive components that draw a holon, and the reader that explores the field. A layout is data in the field, and a component is drawn only on a holon of the type it declares. [ui/](ui/)

The field was born once from markdown, kept in `.stale/markdown` with `bun run import`. From then on the field is the source.
