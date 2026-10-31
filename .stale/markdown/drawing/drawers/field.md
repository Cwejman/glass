---
takes: any
---

# Field

What stands beneath a holon, laid as a field in the order the holon gives, and only what it names where it names any: each one whole, set in columns the way a broadsheet sets its stories, so the eye takes in all of it before it chooses where to go. Labelled, the field opens with its holon's own name and opening line; narrow, it sets its holons in more and slimmer columns.

```ts
export default (h, m, ctx) => {
  const named = h.data.beneath?.map(n => (h.id === '/' ? '' : h.id) + '/' + n)
  const ids = named ? h.beneath.filter(id => named.includes(id)) : h.beneath
  if (!ids.length) return ''
  const label = m.label
    ? `<header class="field-head"><h2><a href="${ctx.href(h.id)}">${ctx.esc(h.title)}</a></h2>${ctx.md(h.lead, h)}</header>` : ''
  const cells = ids.map(id => ctx.mount({ draw: 'holon', holon: id, bare: m.bare }, h)).join('\n')
  return `<section class="field-wrap">${label}<div class="field${m.narrow ? ' narrow' : ''}">${cells}</div></section>`
}
```
