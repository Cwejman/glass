---
takes: any
---

# Holon

One holon, drawn for what it is. Nothing asks what it is called. The words are given room by how much they say, so a short saying stands large and a longer one reads at the pace of prose.

Its relations are drawn from what it holds. What it shows, and what shows it, are named, the second read from the others rather than written twice. What it grew from unfolds in place, the words as they were said and when, so every holon carries its own becoming. What it holds beneath is offered by name, and where it points beyond the holarchy, the address is given.

```ts
export default (h, m, ctx) => {
  const e = ctx.esc
  const n = h.prose.length
  const size = (1 + 0.75 * Math.max(0, Math.min(1, (420 - n) / 340))) * (m.whole ? 1.4 : 1)
  const link = id => `<a href="${ctx.href(id)}">${e(ctx.get(id)?.title ?? id)}</a>`
  const line = (label, ids) => ids.length ? `<p class="rel"><span>${label}</span>${ids.map(link).join('')}</p>` : ''

  const title = m.whole
    ? `<h1 class="name">${e(h.title)}</h1>`
    : `<h2 class="name"><a href="${ctx.href(h.id)}">${e(h.title)}</a></h2>`
  const shows = h.data.shows ?? []
  const shownBy = [...ctx.holons.values()].filter(x => x.data.shows?.includes(h.id)).map(x => x.id)
  const under = !m.whole && !m.bare && h.beneath.length ? line('beneath', h.beneath) : ''
  const away = h.data.repository
    ? `<p class="away"><a href="${e(h.data.repository)}">${e(h.data.repository.replace(/^https?:\/\//, ''))}</a></p>` : ''

  const from = (h.data.from ?? []).map(ctx.get).filter(Boolean)
  const said = from.map(s => `<blockquote class="said">
      <a class="said-name" href="${ctx.href(s.id)}">${e(s.title)}</a>
      ${ctx.md(s.prose, s)}
      <p class="when">said ${ctx.date(s.data.said)}</p>
    </blockquote>`).join('')
  const becoming = !from.length || m.bare ? ''
    : m.whole
      ? `<section class="becoming"><h2>Grown from</h2>${said}</section>`
      : `<details class="becoming"><summary>as it was said</summary>${said}</details>`

  return `<article class="holon${m.whole ? ' whole' : ''}" style="--size:${size.toFixed(2)}rem">
  ${title}
  <div class="words">${ctx.md(h.prose, h)}</div>
  ${line('shows', shows)}${line('shown by', shownBy)}${under}${away}
  ${becoming}
</article>`
}
```
