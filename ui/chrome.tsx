// Chrome: drawn in place over whatever the pointer rests on, never in a panel of its own.
// Its corner names the match, the component and the holon it was handed and why that component;
// its other corner, and a right-click anywhere, opens the actions the field offers there.

import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'
import { drawnBy, drawing, drawable, fitting, type Mounted } from './mount'
import { get, go, lastCommit, link } from './field'
import { put, setWhy } from './edit'

const [hovered, setHovered] = createSignal<Mounted>()
const [menu, setMenu] = createSignal<{ m: Mounted; x: number; y: number }>()
const [measured, setMeasured] = createSignal(0)

const mountedAt = (el: Element | null) => {
  for (let e = el; e; e = e.parentElement) {
    const m = drawnBy.get(e)
    if (m) return m
  }
}
const inChrome = (e: Element) => !!e.closest('.chrome, .menu')

function Mark(p: { m: Mounted }) {
  const rect = () => {
    measured()
    lastCommit()
    const el = drawing.get(p.m)
    return el?.isConnected ? el.getBoundingClientRect() : undefined
  }
  return (
    <Show when={rect()}>
      {r => (
        <div
          class="chrome"
          classList={{ low: r().top < 20 }}
          style={{ top: `${r().top}px`, left: `${r().left}px`, width: `${r().width}px`, height: `${r().height}px` }}
        >
          <span class="chrome-label">
            {p.m.draw} ← {get(p.m.holon)?.title} <i>{p.m.why}</i>
          </span>
          <button class="chrome-more" onClick={e => setMenu({ m: p.m, x: e.clientX, y: e.clientY })}>⋯</button>
        </div>
      )}
    </Show>
  )
}

// ---------------------------------------------------------------- actions

type Action = { name: string; run?: () => void; note?: string }

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')

// what can be done where the pointer rests, assembled from the field and the mount
function actions(m: Mounted): Action[][] {
  const h = get(m.holon)
  if (!h) return []
  const id = h.id
  const others = fitting(h).filter(n => n !== m.draw && drawable(n))
  const drawWith = (name: string) => async () => {
    const at = m.at!
    const a = get(at.arrangement)!
    const data = JSON.parse(JSON.stringify(a.data))
    let node = data.layout
    for (const step of at.path) node = node[step]
    node.draw = name
    await put(a.id, { data })
  }
  return [
    [
      { name: 'Open as page', run: () => go(link(id, '')) },
      { name: 'Open in the field', run: () => go(link(id, 'field')) },
      { name: 'Open in the tree', run: () => go(link(id, 'tree')) },
      { name: 'As JSON', run: () => open('/field' + (id === '/' ? '' : id), '_blank') },
    ],
    [
      { name: `The code of ${m.draw}`, run: () => go(link(`/components/${m.draw}`, 'field')) },
      ...(m.at
        ? others.map(n => ({ name: `Draw with ${n}`, run: drawWith(n) }))
        : others.length
          ? [{ name: 'Draw with another', note: `derived by ${m.parent?.draw}; change it there` }]
          : []),
    ],
    ...(h.data.code && h.data.asks
      ? [
          [
            {
              name: `Run ${h.title}`,
              run: async () => {
                const words = prompt(`${h.title}, asked:`)?.trim()
                if (!words) return
                const r = await fetch('/act', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ program: id, input: { words }, wait: false }),
                })
                if (!r.ok) return setWhy(await r.text())
                go(link((await r.json()).run))
              },
            },
          ],
        ]
      : []),
    [
      {
        name: 'Add a holon beneath',
        run: async () => {
          const title = prompt(`A holon beneath ${h.title}, named:`)?.trim()
          if (!title) return
          const child = (id === '/' ? '' : id) + '/' + slug(title)
          if (get(child)) return setWhy(`${child} already stands`)
          if (await put(child, { title, prose: '', data: {} })) go(link(child))
        },
      },
      ...(h.beneath.length
        ? [{ name: 'Remove', note: 'it holds holons beneath it' }]
        : [
            {
              name: 'Remove',
              run: async () => {
                if (!confirm(`Remove ${h.title}? The commit that removes it is kept.`)) return
                const r = await fetch('/act', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ program: '/programs/remove', input: { id } }),
                })
                if (!r.ok) return setWhy(await r.text())
                go(link(h.above ?? '/'))
              },
            },
          ]),
    ],
  ]
}

function Menu() {
  return (
    <Show when={menu()}>
      {at => (
        <div class="menu" style={{ top: `${Math.min(at().y, innerHeight - 320)}px`, left: `${Math.min(at().x, innerWidth - 260)}px` }}>
          <p class="menu-head">
            {at().m.draw} ← {get(at().m.holon)?.title}
          </p>
          <For each={actions(at().m)}>
            {group => (
              <ul>
                <For each={group}>
                  {a => (
                    <li>
                      <button disabled={!a.run} onClick={() => (setMenu(undefined), a.run?.())}>
                        {a.name}
                        <Show when={a.note}><small>{a.note}</small></Show>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            )}
          </For>
        </div>
      )}
    </Show>
  )
}

export function Chrome() {
  const over = (e: MouseEvent) => !menu() && !inChrome(e.target as Element) && setHovered(mountedAt(e.target as Element))
  const context = (e: MouseEvent) => {
    if (inChrome(e.target as Element)) return
    const m = mountedAt(e.target as Element)
    if (!m) return
    e.preventDefault()
    setMenu({ m, x: e.clientX, y: e.clientY })
  }
  const away = (e: MouseEvent) => menu() && !(e.target as Element).closest('.menu, .chrome-more') && setMenu(undefined)
  const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(undefined)
  const measure = () => setMeasured(n => n + 1)
  document.addEventListener('mouseover', over)
  document.addEventListener('contextmenu', context)
  document.addEventListener('mousedown', away)
  document.addEventListener('keydown', key)
  addEventListener('scroll', measure, true)
  addEventListener('resize', measure)
  onCleanup(() => {
    document.removeEventListener('mouseover', over)
    document.removeEventListener('contextmenu', context)
    document.removeEventListener('mousedown', away)
    document.removeEventListener('keydown', key)
    removeEventListener('scroll', measure, true)
    removeEventListener('resize', measure)
  })
  createEffect(() => document.documentElement.classList.toggle('menu-open', !!menu()))
  return (
    <>
      <Show when={menu()?.m ?? hovered()} keyed>{m => <Mark m={m} />}</Show>
      <Menu />
    </>
  )
}
