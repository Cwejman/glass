---
takes: {has: [open]}
---

# Act

Where a holon declares itself open to an effect, offers it: a few words, handed to the note program. Drawn always, shown only where an engine answers.

```ts
export default (h, m, ctx) => `<form class="act" data-program="/programs/note">
  <input type="hidden" name="beneath" value="${ctx.esc(h.id)}">
  <textarea name="prose" rows="3" required aria-label="A note"></textarea>
  <button>Leave a note</button>
  <p class="why"></p>
</form>`
```
