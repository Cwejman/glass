---
takes: any
---

# Data

What a drawer takes, or how an arrangement lays out, as it stands in the holon; nothing for a holon that declares neither.

```ts
export default (h, m, ctx) => {
  const d = {}
  for (const k of ['takes', 'holon', 'path', 'layout']) if (h.data[k] != null) d[k] = h.data[k]
  return Object.keys(d).length ? `<pre class="data">${ctx.esc(JSON.stringify(d, null, 2))}</pre>` : ''
}
```
