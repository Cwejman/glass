// A mount names a component and the holon it is handed. The component is found by name,
// and is drawn only if the holon is of the type the component says it takes.
// Every mount knows where it stands: the arrangement and the place in its layout it was read from,
// or the mount that derived it. What it draws remembers it, so the drawn page can always be traced to its data.

import { children, createContext, createEffect, createMemo, ErrorBoundary, Show, For, useContext, type JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { get, type H } from './field'

export type M = { draw?: string; holon?: string; of?: M[]; when?: { has?: string[] }; [setting: string]: any }
export type C = (p: { h: H; m: M }) => JSX.Element

// where in an arrangement's layout a mount was read from; a mount a component derives has none
export type At = { arrangement: string; path: (string | number)[] }
export type Mounted = { readonly m: M; readonly holon: string; readonly at?: At; readonly parent?: Mounted }

const components: Record<string, C> = {}
export const register = (cs: Record<string, C>) => Object.assign(components, cs)

const Here = createContext<Mounted>()

// what was drawn, traced back to the mount that drew it
export const drawnBy = new WeakMap<Element, Mounted>()
export const drawing = new WeakMap<Mounted, Element>()

// what a component takes is declared in the field, beside it, as a type
const fits = (name: string, h: H) => {
  const takes = get(`/components/${name}`)?.data.takes
  return !takes || takes === 'any' || h.types.includes(takes)
}

// the fault face: says what could not be drawn, never hides it
export const Fault = (p: { why: string }) => <div class="fault">{p.why}</div>

export function Mount(p: { m: M; h: H; at?: At }) {
  const parent = useContext(Here)
  const target = createMemo(() => (!p.m.holon || p.m.holon === '$' ? p.h : get(p.m.holon)))
  const here: Mounted = {
    get m() { return p.m },
    get holon() { return target()?.id ?? '' },
    get at() { return p.at },
    parent,
  }
  const why = createMemo(() => {
    const t = target()
    if (!t) return `nothing stands at ${p.m.holon}`
    if (!p.m.draw || !components[p.m.draw]) return `no component named ${p.m.draw}`
    if (!fits(p.m.draw, t)) return `${p.m.draw} takes ${get(`/components/${p.m.draw}`)?.data.takes}, which ${t.id} is not`
  })
  const shown = () => (p.m.when?.has ?? []).every(k => target()?.data[k] != null)
  const drawn = children(() => (
    <Show when={shown()}>
      <Here.Provider value={here}>
        <Show when={!why()} fallback={<Fault why={why()!} />}>
          <ErrorBoundary fallback={e => <Fault why={`${p.m.draw}: ${e.message}`} />}>
            <Dynamic component={components[p.m.draw!]} h={target()!} m={p.m} />
          </ErrorBoundary>
        </Show>
      </Here.Provider>
    </Show>
  ))
  createEffect(() => {
    for (const n of drawn.toArray()) if (n instanceof Element) drawnBy.set(n, here), drawing.set(here, n)
  })
  return <>{drawn()}</>
}

// each component encloses, and opens a space where its own mounts draw in turn, each knowing its place in the layout
export const Within = (p: { m: M; h: H }) => {
  const here = useContext(Here)
  return (
    <For each={p.m.of ?? []}>
      {(c, i) => <Mount m={c} h={p.h} at={here?.at && { arrangement: here.at.arrangement, path: [...here.at.path, 'of', i()] }} />}
    </For>
  )
}
