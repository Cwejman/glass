---
takes: any
---

# Bar

The line across the top of every page: the root by name, and the two other ways in, the CV and the data.

```ts
export default (h, m, ctx) => {
  const root = ctx.get('/')
  return `<header class="bar">
  ${h.id === '/' ? '<span></span>' : `<a class="home" href="/">${ctx.esc(root.title)}</a>`}
  <nav><a href="/cv/">CV</a><a href="/data/#${ctx.esc(h.id)}">Data</a></nav>
</header>`
}
```
