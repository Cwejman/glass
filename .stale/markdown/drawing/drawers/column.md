---
takes: any
---

# Column

The page's one column of prose, its mounts one under another.

```ts
export default (h, m, ctx) => `<main class="column">${ctx.children(m, h)}</main>`
```
