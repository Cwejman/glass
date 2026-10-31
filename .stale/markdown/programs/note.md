---
became: 2026-10-31
takes: {has: [prose]}
gives: add
shows: [/primitives/program, /primitives/effect]
---

# Note

Takes a few words and asks to add them, as a holon of their own, beneath the place they were left. It touches nothing itself.

```ts
export default input => {
  const prose = String(input.prose ?? '').trim().slice(0, 2000).replace(/</g, '&lt;')
  if (!prose) throw new Error('a note holds some words')
  return { add: { beneath: String(input.beneath), prose } }
}
```
