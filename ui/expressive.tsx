// Expressive components: they draw a holon, or a part of one, for what it is.

import { createSignal, For, Show } from 'solid-js'
import { register, type C } from './mount'
import { all, get, link, date, time, type H } from './field'
import { Title, Words } from './edit'
import { Bar } from './views'

const Name = (p: { id: string }) => <a href={link(p.id)}>{get(p.id)?.title ?? p.id}</a>

const Rel = (p: { label: string; ids: string[] }) => (
  <Show when={p.ids.length}>
    <p class="rel">
      <span>{p.label}</span>
      <For each={p.ids}>{id => <Name id={id} />}</For>
    </p>
  </Show>
)

// the words are given room by how much they say: a short saying stands large, a longer one reads at the pace of prose
const size = (h: H, whole: boolean) => (1 + 0.75 * Math.max(0, Math.min(1, (420 - h.prose.length) / 340))) * (whole ? 1.4 : 1)

const holon: C = p => {
  const shownBy = () => all().filter(x => x.data.shows?.includes(p.h.id)).map(x => x.id)
  const from = () => ((p.h.data.from ?? []) as string[]).map(id => get(id)).filter(Boolean) as H[]
  const Said = () => (
    <For each={from()}>
      {s => (
        <blockquote class="said">
          <a class="said-name" href={link(s.id)}>{s.title}</a>
          <div innerHTML={s.html} />
          <p class="when">said {date(s.data.said)}</p>
        </blockquote>
      )}
    </For>
  )
  return (
    <article class="holon" classList={{ whole: !!p.m.whole }} style={{ '--size': `${size(p.h, !!p.m.whole).toFixed(2)}rem` }}>
      <Show when={p.m.whole} fallback={<h2 class="name"><a href={link(p.h.id)}>{p.h.title}</a></h2>}>
        <Title h={p.h} class="name" />
      </Show>
      <Words h={p.h} />
      <Rel label="shows" ids={p.h.data.shows ?? []} />
      <Rel label="shown by" ids={shownBy()} />
      <Show when={!p.m.whole && !p.m.bare}>
        <Rel label="beneath" ids={p.h.beneath.slice(0, 12)} />
      </Show>
      <Show when={p.h.data.repository}>
        <p class="away"><a href={p.h.data.repository}>{p.h.data.repository.replace(/^https?:\/\//, '')}</a></p>
      </Show>
      <Show when={from().length && !p.m.bare}>
        <Show when={p.m.whole} fallback={<details class="becoming"><summary>as it was said</summary><Said /></details>}>
          <section class="becoming"><h2>Grown from</h2><Said /></section>
        </Show>
      </Show>
    </article>
  )
}

// where the holon is open to a program, offers it
const act: C = p => {
  const program = () => p.m.program ?? '/programs/note'
  const open = () => (p.h.data.open?.add ?? []).includes(program())
  const [why, setWhy] = createSignal('')
  const [words, setWords] = createSignal('')
  const send = async (e: SubmitEvent) => {
    e.preventDefault()
    setWhy('')
    const r = await fetch('/act', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ program: program(), input: { beneath: p.h.id, prose: words() } }),
    })
    r.ok ? setWords('') : setWhy(await r.text())
  }
  return (
    <Show when={open()}>
      <form class="act" onSubmit={send}>
        <textarea rows={3} required aria-label="A note" value={words()} onInput={e => setWords(e.currentTarget.value)} />
        <button>Leave a note</button>
        <Show when={why()}><p class="why">{why()}</p></Show>
      </form>
    </Show>
  )
}

const bar: C = () => <Bar />

// the way down from the root, line by line
const pathC: C = p => {
  const chain = () => {
    const ids: string[] = []
    for (let id = p.h.above; id; id = get(id)?.above ?? null) ids.unshift(id)
    return ids
  }
  return (
    <Show when={chain().length}>
      <nav class="path">
        <For each={chain()}>{(id, i) => <a href={link(id)} style={{ '--depth': i() }}>{get(id)?.title ?? id}</a>}</For>
      </nav>
    </Show>
  )
}

const linked: C = p => (
  <Show when={p.h.linked.length}>
    <section class="linked">
      <h2>Spoken of in</h2>
      <For each={p.h.linked}>{id => <Name id={id} />}</For>
    </section>
  </Show>
)

// the holon as data, and its history
const open: C = p => (
  <footer class="open">
    <p>
      <a href={link(p.h.id, 'field')}>Read it in the field</a> · <a href={'/field' + (p.h.id === '/' ? '' : p.h.id)}>as data</a>
    </p>
    <p class="history">
      born {time(p.h.born)} · {p.h.history.commits} {p.h.history.commits === 1 ? 'commit' : 'commits'}
      <Show when={p.h.history.last && p.h.history.commits > 1}>, last {time(p.h.history.last!)}</Show>
    </p>
  </footer>
)

register({ holon, act, bar, path: pathC, linked, open })
