// Inspect: the drawn page and the data it is drawn from, brought together.
// Hovering tints what a click would act on and names it: the component, and the holon it draws.
// Choosing opens it beside the page: where its mount stands in the arrangement, what draws it, and the holon itself.
// Every change made here is a commit through the edit program, and the page redraws from it as it lands.

import { createEffect, createSignal, For, onCleanup, Show, untrack } from 'solid-js'
import { drawnBy, drawing, type Mounted } from './mount'
import { get, href, lastCommit, time, type H } from './field'
import { Code, ComponentSource } from './code'

const remembered = () => {
  try {
    return localStorage.getItem('glass.inspect') === 'on'
  } catch {
    return false
  }
}
export const [inspecting, setInspecting] = createSignal(remembered())
const [hovered, setHovered] = createSignal<Mounted>()
const [chosen, setChosen] = createSignal<Mounted>()
const [measured, setMeasured] = createSignal(0)

const mountedAt = (el: Element | null) => {
  for (let e = el; e; e = e.parentElement) {
    const m = drawnBy.get(e)
    if (m) return m
  }
}
const inChrome = (e: Element) => !!e.closest('.inspector, .inspect-toggle')

async function edit(input: Record<string, any>) {
  const r = await fetch('/act', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ program: '/programs/edit', input }),
  })
  return r.ok ? '' : await r.text()
}

// ---------------------------------------------------------------- marks on the page

function Mark(p: { m?: Mounted; chosen?: boolean }) {
  const rect = () => {
    measured()
    lastCommit()
    const el = p.m && drawing.get(p.m)
    return el?.isConnected ? el.getBoundingClientRect() : undefined
  }
  return (
    <Show when={rect()}>
      {r => (
        <div
          class="mark"
          classList={{ chosen: p.chosen, low: r().top < 20 }}
          style={{ top: `${r().top}px`, left: `${r().left}px`, width: `${r().width}px`, height: `${r().height}px` }}
        >
          <span class="mark-label">
            {p.m!.m.draw} · {get(p.m!.holon)?.title}
          </span>
        </div>
      )}
    </Show>
  )
}

// ---------------------------------------------------------------- the mount

const place = (path: (string | number)[]) => ['layout', ...path.map(x => (typeof x === 'number' ? `[${x}]` : `.${x}`))].join('')

// a setting as typed: true, false and numbers as themselves, anything else as words
const parse = (s: string) => (s === 'true' ? true : s === 'false' ? false : s !== '' && !isNaN(+s) ? +s : s)

function MountPart(p: { m: Mounted }) {
  const [why, setWhy] = createSignal('')
  const [key, setKey] = createSignal('')
  const [value, setValue] = createSignal('')
  const settings = () => Object.entries(p.m.m).filter(([k]) => k !== 'of' && k !== 'draw')

  // a setting changed is the arrangement put again with its layout changed at this mount's place
  const set = async (k: string, v: any) => {
    const at = p.m.at!
    const a = get(at.arrangement)!
    const data = JSON.parse(JSON.stringify(a.data))
    let node = data.layout
    for (const step of at.path) node = node[step]
    if (v === undefined || v === '') delete node[k]
    else node[k] = v
    setWhy(await edit({ id: a.id, data }))
  }

  return (
    <section class="part">
      <h3>Mount</h3>
      <Show
        when={p.m.at}
        fallback={
          <p class="quiet">
            Derived by <b>{p.m.parent?.m.draw}</b> from what {get(p.m.parent?.holon)?.title} holds, so it is not stored. Choose{' '}
            <button class="link" onClick={() => setChosen(p.m.parent)}>{p.m.parent?.m.draw}</button> to change how it is laid.
          </p>
        }
      >
        {at => (
          <>
            <p class="quiet">
              In <a href={'/~' + href(at().arrangement)}>{get(at().arrangement)?.title}</a>, at <code>{place(at().path)}</code>
            </p>
            <table class="settings">
              <tbody>
                <tr>
                  <th>draw</th>
                  <td><code>{p.m.m.draw}</code></td>
                </tr>
                <For each={settings()}>
                  {([k, v]) => (
                    <tr>
                      <th>{k}</th>
                      <td>
                        {typeof v === 'boolean' ? (
                          <input type="checkbox" checked={v} onChange={e => set(k, e.currentTarget.checked)} />
                        ) : typeof v === 'object' ? (
                          <code>{JSON.stringify(v)}</code>
                        ) : (
                          <input value={String(v)} onChange={e => set(k, parse(e.currentTarget.value))} />
                        )}
                        <button class="link remove" title={`remove ${k}`} onClick={() => set(k, undefined)}>×</button>
                      </td>
                    </tr>
                  )}
                </For>
                <tr class="adding">
                  <th><input placeholder="setting" value={key()} onInput={e => setKey(e.currentTarget.value)} /></th>
                  <td>
                    <input
                      placeholder="value"
                      value={value()}
                      onInput={e => setValue(e.currentTarget.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && key()) set(key(), parse(value())).then(() => (setKey(''), setValue('')))
                      }}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </Show>
      <Show when={why()}><p class="why">{why()}</p></Show>
    </section>
  )
}

// ---------------------------------------------------------------- the holon

function HolonPart(p: { h: H }) {
  const now = () => ({ title: p.h.title, prose: p.h.prose, data: JSON.stringify(p.h.data, null, 2) })
  const [title, setTitle] = createSignal(p.h.title)
  const [prose, setProse] = createSignal(p.h.prose)
  const [data, setData] = createSignal(now().data)
  const [why, setWhy] = createSignal('')
  let synced = now()
  const unsaved = () => title() !== p.h.title || prose() !== p.h.prose || data() !== now().data

  // when the holon changes from elsewhere and nothing here is unsaved, follow it
  createEffect(() => {
    const next = now()
    untrack(() => {
      if (title() === synced.title && prose() === synced.prose && data() === synced.data) {
        setTitle(next.title), setProse(next.prose), setData(next.data)
      }
    })
    synced = next
  })

  const save = async () => {
    let parsed
    try {
      parsed = JSON.parse(data())
    } catch {
      return setWhy('the data is not well formed JSON')
    }
    setWhy(await edit({ id: p.h.id, title: title(), prose: prose(), data: parsed }))
  }
  const saveOnChord = (e: KeyboardEvent) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && (e.preventDefault(), save())

  return (
    <section class="part">
      <h3>Holon</h3>
      <p class="identity">
        <a href={'/~' + href(p.h.id)}><code>{p.h.id}</code></a>
        <For each={p.h.types}>{t => <span class="badge">{get(t)?.title}</span>}</For>
      </p>
      <label>
        <span>title</span>
        <input value={title()} onInput={e => setTitle(e.currentTarget.value)} onKeyDown={saveOnChord} />
      </label>
      <label>
        <span>words</span>
        <textarea rows={Math.min(14, Math.max(4, prose().split('\n').length + 2))} value={prose()} onInput={e => setProse(e.currentTarget.value)} onKeyDown={saveOnChord} />
      </label>
      <Show when={typeof p.h.data.code === 'string'}>
        <details open>
          <summary>code</summary>
          <Code text={p.h.data.code} />
        </details>
      </Show>
      <details>
        <summary>data</summary>
        <textarea class="code" rows={Math.min(16, data().split('\n').length + 1)} value={data()} onInput={e => setData(e.currentTarget.value)} onKeyDown={saveOnChord} />
      </details>
      <p class="actions">
        <button disabled={!unsaved()} onClick={save}>Put it so</button>
        <span class="quiet">{unsaved() ? '⌘↵' : `${p.h.history.commits} ${p.h.history.commits === 1 ? 'commit' : 'commits'}, last ${p.h.history.last ? time(p.h.history.last) : ''}`}</span>
      </p>
      <Show when={why()}><p class="why">{why()}</p></Show>
    </section>
  )
}

// ---------------------------------------------------------------- beside the page

function Opened(p: { m: Mounted }) {
  const chain = () => {
    const c: Mounted[] = []
    for (let x: Mounted | undefined = p.m; x; x = x.parent) c.unshift(x)
    return c
  }
  const declaration = () => get(`/components/${p.m.m.draw}`)
  return (
    <>
      <nav class="chain">
        <For each={chain()}>
          {x => (
            <button class="link" classList={{ here: x === p.m }} onClick={() => setChosen(x)} title={get(x.holon)?.title}>
              {x.m.draw}
            </button>
          )}
        </For>
      </nav>
      <MountPart m={p.m} />
      <section class="part">
        <h3>Drawn by</h3>
        <p>
          <a href={'/~' + href(`/components/${p.m.m.draw}`)}>{p.m.m.draw}</a>
          <Show when={declaration()?.data.takes}>{t => <span class="quiet"> takes {t()}</span>}</Show>
        </p>
        <Show when={declaration()?.html}><div class="quiet" innerHTML={declaration()!.html} /></Show>
        <details>
          <summary>its code</summary>
          <ComponentSource name={p.m.m.draw!} />
        </details>
      </section>
      <Show when={get(p.m.holon)} keyed>
        {h => <HolonPart h={h} />}
      </Show>
    </>
  )
}

export function Inspect() {
  createEffect(() => {
    document.documentElement.classList.toggle('inspecting', inspecting())
    try {
      localStorage.setItem('glass.inspect', inspecting() ? 'on' : 'off')
    } catch {}
    if (!inspecting()) return
    const over = (e: MouseEvent) => !inChrome(e.target as Element) && setHovered(mountedAt(e.target as Element))
    // in inspecting, a click chooses what it lands on; with alt held it does what it always does
    const click = (e: MouseEvent) => {
      if (e.altKey || inChrome(e.target as Element)) return
      const m = mountedAt(e.target as Element)
      if (!m) return
      e.preventDefault()
      e.stopPropagation()
      setChosen(m)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (chosen() ? setChosen(undefined) : setInspecting(false))
    const measure = () => setMeasured(n => n + 1)
    document.addEventListener('mouseover', over)
    document.addEventListener('click', click, true)
    document.addEventListener('keydown', key)
    addEventListener('scroll', measure, true)
    addEventListener('resize', measure)
    onCleanup(() => {
      document.removeEventListener('mouseover', over)
      document.removeEventListener('click', click, true)
      document.removeEventListener('keydown', key)
      removeEventListener('scroll', measure, true)
      removeEventListener('resize', measure)
      setHovered(undefined)
    })
  })

  return (
    <>
      <button class="inspect-toggle" onClick={() => setInspecting(!inspecting())}>
        {inspecting() ? 'Done' : 'Inspect'}
      </button>
      <Show when={inspecting()}>
        <Show when={hovered() !== chosen()}><Mark m={hovered()} /></Show>
        <Mark m={chosen()} chosen />
        <aside class="inspector">
          <Show
            when={chosen()}
            keyed
            fallback={
              <p class="quiet">
                Everything on the page is drawn from the field. Hover to see what draws it; click to open it here with the data it is drawn
                from, and change it in place. Alt-click follows a link; Escape closes.
              </p>
            }
          >
            {m => <Opened m={m} />}
          </Show>
        </aside>
      </Show>
    </>
  )
}
