# glass

A field of holons, and an engine that holds it. This is where Jona Cwejman is online, and it runs as itself on your own machine.

```bash
bun install
bun start
```

Then open http://localhost:4321. Every address can be seen as a page, in the field (`?as=field`, a card for every level), or in the tree (`?as=tree`); moving between them keeps where you are.

## What is here

- **The field**, in `field.db`: every holon in SQLite, and every change to it as a commit that says by whom, when and what it touched. [src/field.ts](src/field.ts)
- **The engine** holds the field, serves it as data at `/field`, tells every open page of each commit, runs programs, and carries out their effects only where the field declares itself open to them. Every request that reaches it is kept as a visit beneath `/traffic`: when, where to, from where, what kind of browser, never who. [src/engine.ts](src/engine.ts)
- **Runs.** Every program run is kept beneath `/runs` as it goes: what it was asked, the runs it called, and what came of it (a commit, what it gave, or why it was refused). A program is handed its run, to read the field and to call other programs as steps of itself. The harness is such a program: it calls the completion program (the model) and runs the programs it names as tools, each call a step in its thread. The completion program takes its credentials from the engine's environment (`ANTHROPIC_API_KEY`); without them it is refused, and the run says so.
- **The interface** is components in Solid TSX: views that draw from the address, layout components that hold mounts, and faces that draw a holon for its type. A layout is data in the field; a mount names its component or lets the holon find the one its type fits. Resting on anything drawn shows what drew it, and its actions are a right-click away; titles, words, what a holon holds and a program's code are edited where they stand, each change a commit. The code of all of it is readable in the tree. [ui/](ui/)

The field was born once from markdown, kept in `.stale/markdown` with `bun run import`. From then on the field is the source.
