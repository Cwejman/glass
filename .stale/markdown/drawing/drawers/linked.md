---
takes: any
---

# Linked

What speaks of a holon from elsewhere in the holarchy, beyond what stands above it.

```ts
export default (h, m, ctx) => {
  const from = h.linked.filter(id => id !== h.above)
  if (!from.length) return ''
  return `<section class="linked"><h2>Spoken of in</h2>${from.map(id =>
    `<a href="${ctx.href(id)}">${ctx.esc(ctx.get(id).title)}</a>`).join('')}</section>`
}
```
