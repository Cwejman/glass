// Faces: components that draw a holon for the type it has. Each draws at two grades:
// a row, as it stands among others in a list, and whole, as the holon itself, editable where it stands.
// `face` draws whatever nothing else takes: its words, what it holds, and what it relates to.

import { createSignal, For, Show } from 'solid-js'
import { register, type C } from './mount'
import { all, get, link, date, time, type H } from './field'
import { Holds, put, Title, Words } from './edit'
import { Code, ComponentSource } from './code'

const plain = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const Chips = (p: { label: string; ids: string[] }) => (
  <Show when={p.ids.length}>
    <p class="rel">
      <span>{p.label}</span>
      <For each={p.ids}>{id => <a class="chip" href={link(id)}>{get(id)?.title ?? id}</a>}</For>
    </p>
  </Show>
)

const Types = (p: { h: H }) => (
  <p class="identity">
    <code>{p.h.id}</code>
    <For each={p.h.types}>{t => <a class="badge" href={link(t)}>{get(t)?.title}</a>}</For>
  </p>
)

// what is around a holon: what it shows and what shows it, what it links and what links it, and how it came to be
const Around = (p: { h: H }) => {
  const shownBy = () => all().filter(x => x.data.shows?.includes(p.h.id)).map(x => x.id)
  return (
    <>
      <Chips label="shown by" ids={shownBy()} />
      <Chips label="links to" ids={p.h.links.filter(id => get(id))} />
      <Chips label="linked from" ids={p.h.linked} />
      <p class="history">
        born {time(p.h.born)} · {p.h.history.commits} {p.h.history.commits === 1 ? 'commit' : 'commits'}
        <Show when={p.h.history.commits > 1 && p.h.history.last}>, last {time(p.h.history.last!)}</Show>
      </p>
    </>
  )
}

const Row = (p: { h: H; lead?: string; note?: string }) => (
  <a class="row" href={link(p.h.id)}>
    <span class="row-title">{p.h.title}</span>
    <Show when={p.lead ?? plain(p.h.html)}>{l => <span class="row-lead">{l()}</span>}</Show>
    <Show when={p.note ?? (p.h.beneath.length ? String(p.h.beneath.length) : '')}>{n => <small>{n()}</small>}</Show>
  </a>
)

const Whole = (p: { h: H; skip?: string[]; children?: any }) => (
  <article class="face">
    <Types h={p.h} />
    <Title h={p.h} />
    <Words h={p.h} />
    {p.children}
    <Holds h={p.h} skip={p.skip} />
    <Around h={p.h} />
  </article>
)

const face: C = p => (p.m.grade === 'row' ? <Row h={p.h} /> : <Whole h={p.h} />)

// a request that reached the engine: where to, by what kind of browser, and when
const visit: C = p =>
  p.m.grade === 'row' ? (
    <a class="row visit" href={link(p.h.id)}>
      <code>{p.h.data.visit}</code>
      <span class="row-lead">{p.h.data.agent}</span>
      <small>{p.h.data.at?.slice(11, 19)}</small>
    </a>
  ) : (
    <Whole h={p.h} />
  )

// words kept as they were said
const said: C = p =>
  p.m.grade === 'row' ? (
    <Row h={p.h} note={date(p.h.data.said)} />
  ) : (
    <Whole h={p.h}>
      <p class="when">said {date(p.h.data.said)}</p>
    </Whole>
  )

// a program: its words, and its code, edited where it stands like its words are
const program: C = p => {
  const [open, setOpen] = createSignal(false)
  const [text, setText] = createSignal('')
  return p.m.grade === 'row' ? (
    <Row h={p.h} note={p.h.data.gives} />
  ) : (
    <Whole h={p.h} skip={['code']}>
      <section class="code-part">
        <h3>Code</h3>
        <Show
          when={open()}
          fallback={
            <div class="editable" onClick={() => (setText(p.h.data.code), setOpen(true))}>
              <Code text={p.h.data.code} />
            </div>
          }
        >
          <textarea
            class="code-source"
            ref={el => requestAnimationFrame(() => (el.focus(), (el.style.height = el.scrollHeight + 'px')))}
            value={text()}
            onInput={e => setText(e.currentTarget.value)}
            onBlur={async () => {
              if (text() !== p.h.data.code) await put(p.h.id, { data: { ...JSON.parse(JSON.stringify(p.h.data)), code: text() } })
              setOpen(false)
            }}
            onKeyDown={e => e.key === 'Escape' && setOpen(false)}
          />
        </Show>
      </section>
    </Whole>
  )
}

// a component: what it takes, and its code where the interface holds it
const component: C = p =>
  p.m.grade === 'row' ? (
    <Row h={p.h} note={p.h.data.takes === 'any' ? 'any' : get(p.h.data.takes)?.title} />
  ) : (
    <Whole h={p.h}>
      <section class="code-part">
        <h3>Code</h3>
        <ComponentSource name={p.h.id.slice('/components/'.length)} />
      </section>
    </Whole>
  )

register({ face, visit, said, program, component })
