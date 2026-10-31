// A mount names a component and the holon it is handed, or names none and lets the holon find its own:
// the component that declares, in the field, a type the holon has. `face` draws whatever nothing else takes.
// Every mount knows where it stands, the arrangement and the place in its layout it was read from,
// or the mount that derived it, and why its component was chosen. What it draws remembers it.

import { children, createContext, createEffect, createMemo, ErrorBoundary, Show, For, useContext, type JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { get, type H } from './field'

export type M = { draw?: string; holon?: string; of?: M[]; when?: { has?: string[] }; [setting: string]: any }
export type C = (p: { h: H; m: M }) => JSX.Element

// where in an arrangement's layout a mount was read from; a mount a component derives has none
export type At = { arrangement: string; path: (string | number)[] }
export type Mounted = {
  readonly m: M
  readonly draw: string
  readonly why: string
  readonly holon: string
  readonly at?: At
  readonly parent?: Mounted
}

const components: Record<string, C> = {}
export const register = (cs: Record<string, C>) => Object.assign(components, cs)
export const drawable = (name: string) => !!components[name]

const Here = createContext<Mounted>()
export const useMounted = () => useContext(Here)

// what was drawn, traced back to the mount that drew it
export const drawnBy = new WeakMap<Element, Mounted>()
export const drawing = new WeakMap<Mounted, Element>()

const declared = (name: string) => get(`/components/${name}`)?.data.takes

// what a component takes is declared in the field, beside it, as a type
export const fits = (name: string, h: H) => {
  const takes = declared(name)
  return !takes || takes === 'any' || h.types.includes(takes)
}

// the components that could draw a holon: those whose type it has, in the order the field gives them, and face
export const fitting = (h: H) => {
  const named = (get('/components')?.beneath ?? []).map(id => id.slice('/components/'.length))
  return [...named.filter(n => drawable(n) && declared(n) && declared(n) !== 'any' && h.types.includes(declared(n))), 'face']
}

// the fault face: says what could not be drawn, never hides it
export const Fault = (p: { why: string }) => <div class="fault">{p.why}</div>

export function Mount(p: { m: M; h: H; at?: At }) {
  const parent = useContext(Here)
  const target = createMemo(() => (!p.m.holon || p.m.holon === '$' ? p.h : get(p.m.holon)))
  const draw = createMemo(() => p.m.draw ?? (target() ? fitting(target()!)[0] : 'face'))
  const here: Mounted = {
    get m() { return p.m },
    get draw() { return draw() },
    get why() {
      const t = draw() && declared(draw())
      return p.m.draw ? 'named' : t && t !== 'any' ? `is a ${get(t)?.title ?? t}` : 'nothing else takes it'
    },
    get holon() { return target()?.id ?? '' },
    get at() { return p.at },
    parent,
  }
  const why = createMemo(() => {
    const t = target()
    if (!t) return `nothing stands at ${p.m.holon}`
    if (!components[draw()]) return `no component named ${draw()}`
    if (!fits(draw(), t)) return `${draw()} takes ${declared(draw())}, which ${t.id} is not`
  })
  const shown = () => (p.m.when?.has ?? []).every(k => target()?.data[k] != null)
  const drawn = children(() => (
    <Show when={shown()}>
      <Here.Provider value={here}>
        <Show when={!why()} fallback={<Fault why={why()!} />}>
          <ErrorBoundary fallback={e => <Fault why={`${draw()}: ${e.message}`} />}>
            <Dynamic component={components[draw()]} h={target()!} m={p.m} />
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
