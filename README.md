# Glass

Glass is an operating system made anew, one field of holons where data, knowledge, programs and interfaces live together. Everything known of it is in its store, not here: this file only says how to reach it.

With [Bun](https://bun.sh), from this folder:

```
bun install
bun engine/ask.ts 'text(@Knowledge)'
```

The second line reads Knowledge, the top of what is known: what glass is, its design, the way from here, how the work is done, and its words. Start there. `outline(@Knowledge, 3)` gives its shape instead, and any other expression asks the field the same way.

To see it drawn: `bun run build` and `bun run serve`, then open `http://127.0.0.1:4330/`.
