// Editing in place: a holon's title, its words and what it holds are changed where they are drawn.
// Every change is one commit through the edit program, and the drawing follows it as it lands.

import { createSignal, For, Show, type JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { get, link, type H } from './field'
import { Code } from './code'

export const [why, setWhy] = createSignal('')

export async function put(id: string, patch: { title?: string; prose?: string; data?: Record<string, any> }) {
  const r = await fetch('/act', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ program: '/programs/edit', input: { id, ...patch } }),
  })
  setWhy(r.ok ? '' : await r.text())
  return r.ok
}

const setKey = (h: H, key: string, value: any) => {
  const data = JSON.parse(JSON.stringify(h.data))
  if (value === undefined) delete data[key]
  else data[key] = value
  return put(h.id, { data })
}

// a title, edited as it stands
export function Title(p: { h: H; tag?: 'h1' | 'h2' | 'h3'; class?: string }) {
  const done = (e: FocusEvent & { currentTarget: HTMLElement }) => {
    const text = e.currentTarget.textContent?.trim() ?? ''
    if (text && text !== p.h.title) put(p.h.id, { title: text })
    else e.currentTarget.textContent = p.h.title
  }
  const keys = (e: KeyboardEvent & { currentTarget: HTMLElement }) => {
    if (e.key === 'Enter') e.preventDefault(), e.currentTarget.blur()
    if (e.key === 'Escape') (e.currentTarget.textContent = p.h.title), e.currentTarget.blur()
  }
  return (
    <Dynamic component={p.tag ?? 'h1'} class={`editable ${p.class ?? ''}`} contentEditable="plaintext-only" spellcheck={false} onBlur={done} onKeyDown={keys}>
      {p.h.title}
    </Dynamic>
  )
}

// the words as drawn; clicked, they open as the markdown they are, and leaving them puts them so
export function Words(p: { h: H; class?: string; style?: JSX.CSSProperties }) {
  const [open, setOpen] = createSignal(false)
  const [text, setText] = createSignal('')
  const begin = (e: MouseEvent) => {
    if ((e.target as Element).closest('a')) return
    setText(p.h.prose)
    setOpen(true)
  }
  const end = async () => {
    if (text() !== p.h.prose) await put(p.h.id, { prose: text() })
    setOpen(false)
  }
  return (
    <Show
      when={open()}
      fallback={
        <div class={`words editable ${p.class ?? ''}`} style={p.style} onClick={begin} innerHTML={p.h.html || '<p class="empty">Words…</p>'} />
      }
    >
      <textarea
        class="words-source"
        ref={el => requestAnimationFrame(() => (el.focus(), (el.style.height = el.scrollHeight + 'px')))}
        value={text()}
        onInput={e => (setText(e.currentTarget.value), (e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px'))}
        onBlur={end}
        onKeyDown={e => {
          if (e.key === 'Escape') setText(p.h.prose), setOpen(false)
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    </Show>
  )
}

// ---------------------------------------------------------------- what a holon holds, by type

const isId = (v: any) => typeof v === 'string' && v.startsWith('/') && !!get(v.replace(/\/$/, '') || '/')
const parse = (s: string) => (s === 'true' ? true : s === 'false' ? false : s !== '' && !isNaN(+s) ? +s : s)

function Text(p: { value: string | number; onPut: (v: any) => void }) {
  return (
    <span
      class="editable value"
      contentEditable="plaintext-only"
      spellcheck={false}
      onBlur={e => {
        const v = parse(e.currentTarget.textContent ?? '')
        v !== p.value ? p.onPut(v) : (e.currentTarget.textContent = String(p.value))
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.preventDefault(), e.currentTarget.blur()
        if (e.key === 'Escape') (e.currentTarget.textContent = String(p.value)), e.currentTarget.blur()
      }}
    >
      {String(p.value)}
    </span>
  )
}

const Chip = (p: { id: string; onRemove?: () => void }) => (
  <span class="chip">
    <a href={link(p.id)}>{get(p.id)?.title ?? p.id}</a>
    <Show when={p.onRemove}><button class="x" title="remove" onClick={p.onRemove}>×</button></Show>
  </span>
)

function Value(p: { h: H; k: string; v: any }) {
  const set = (v: any) => setKey(p.h, p.k, v)
  const v = p.v
  if (typeof v === 'boolean')
    return <button class="toggle" classList={{ on: v }} onClick={() => set(!v)}>{v ? 'yes' : 'no'}</button>
  if (isId(v)) return <Chip id={v} />
  if (typeof v === 'string' || typeof v === 'number') return <Text value={v} onPut={set} />
  if (Array.isArray(v) && v.every(x => typeof x === 'string')) {
    const [adding, setAdding] = createSignal('')
    return (
      <span class="chips">
        <For each={v}>
          {(x, i) =>
            isId(x) ? (
              <Chip id={x} onRemove={() => set(v.filter((_, j) => j !== i()))} />
            ) : (
              <span class="chip">{x}<button class="x" onClick={() => set(v.filter((_, j) => j !== i()))}>×</button></span>
            )
          }
        </For>
        <input
          class="add"
          placeholder="+"
          value={adding()}
          onInput={e => setAdding(e.currentTarget.value)}
          onKeyDown={e => e.key === 'Enter' && adding() && (set([...v, adding()]), setAdding(''))}
        />
      </span>
    )
  }
  return <Code text={JSON.stringify(v, null, 2)} lang="json" />
}

// what a holon holds, each value drawn and edited as what it is; code is left to whoever draws code
export function Holds(p: { h: H; skip?: string[] }) {
  const [key, setKeyName] = createSignal('')
  const [val, setVal] = createSignal('')
  const entries = () => Object.entries(p.h.data).filter(([k]) => !(p.skip ?? []).includes(k))
  return (
    <dl class="holds">
      <For each={entries()}>
        {([k, v]) => (
          <>
            <dt>
              {k}
              <button class="x" title={`remove ${k}`} onClick={() => setKey(p.h, k, undefined)}>×</button>
            </dt>
            <dd><Value h={p.h} k={k} v={v} /></dd>
          </>
        )}
      </For>
      <dt class="adding">
        <input placeholder="hold…" value={key()} onInput={e => setKeyName(e.currentTarget.value)} />
      </dt>
      <dd class="adding">
        <input
          placeholder="value"
          value={val()}
          onInput={e => setVal(e.currentTarget.value)}
          onKeyDown={e => e.key === 'Enter' && key() && setKey(p.h, key(), parse(val())).then(() => (setKeyName(''), setVal('')))}
        />
      </dd>
    </dl>
  )
}
