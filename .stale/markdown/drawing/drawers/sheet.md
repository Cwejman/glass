---
takes: any
---

# Sheet

A sheet of paper: the CV's page, its mounts one under another, set to print.

```ts
export default (h, m, ctx) => `<main class="sheet">${ctx.children(m, h)}</main>`
```
