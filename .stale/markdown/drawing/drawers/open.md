---
takes: any
---

# Open

The way into the holon as data: its own address, the whole holarchy, the browser, and its history.

```ts
export default (h, m, ctx) => {
  const t = h.history
  const day = s => s.slice(0, 10)
  const when = t ? `Written ${day(t.first)}${t.last !== t.first ? `, changed ${day(t.last)}` : ''}, ${t.commits} commit${t.commits > 1 ? 's' : ''}.` : 'Not yet committed.'
  return `<footer class="open">
  <p>This page is drawn from open data. <a href="${ctx.json(h.id)}">This holon as JSON</a> · <a href="/holarchy.json">the whole holarchy</a> · <a href="/data/#${ctx.esc(h.id)}">open it in the browser</a> · <a href="/drawing/">how it is drawn</a></p>
  <p class="history">${ctx.esc(h.file)} · ${when}</p>
</footer>`
}
```
