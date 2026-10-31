---
takes: any
---

# Path

Where the holon stands, from the root down, one line for each holon above it.

```ts
export default (h, m, ctx) => {
  const up = []
  for (let id = h.above; id; id = ctx.get(id)?.above) up.unshift(ctx.get(id))
  if (up.length < 2) return ''
  return `<nav class="path">${up.map((a, i) =>
    `<a style="--depth:${i}" href="${ctx.href(a.id)}">${ctx.esc(a.title)}</a>`).join('')}</nav>`
}
```
