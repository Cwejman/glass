// The field as the interface holds it: loaded once, kept live by every commit the engine tells.

import { createSignal } from 'solid-js'
import { createStore, reconcile } from 'solid-js/store'

export type H = {
  id: string
  above: string | null
  title: string
  data: Record<string, any>
  prose: string
  html: string
  beneath: string[]
  links: string[]
  linked: string[]
  types: string[]
  history: { commits: number; first?: string; last?: string }
  born: string
  changed: string
}

export type Commit = { seq: number; at: string; by: string; touched: string; effect: any }

const [holons, setHolons] = createStore<Record<string, H>>({})
export const get = (id?: string | null) => (id ? holons[id] : undefined)
export const all = () => Object.values(holons)

export const [loaded, setLoaded] = createSignal(false)
export const [lastCommit, setLastCommit] = createSignal<Commit>()

export async function connect() {
  const list: H[] = await fetch('/field').then(r => r.json())
  setHolons(reconcile(Object.fromEntries(list.map(h => [h.id, h]))))
  setLoaded(true)
  const listen = () => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/live`)
    ws.onmessage = e => {
      const told = JSON.parse(e.data)
      if (told.reload) return location.reload()
      for (const h of told.holons) setHolons(h.id, reconcile(h))
      setLastCommit(told.commit)
    }
    ws.onclose = () => setTimeout(listen, 1000)
  }
  listen()
}

// ---------------------------------------------------------------- where we are

export const [path, setPath] = createSignal(location.pathname)
export const href = (id: string) => (id === '/' ? '/' : id + '/')
export const idOf = (p: string) => p.replace(/\/+$/, '') || '/'

export function go(to: string) {
  history.pushState(null, '', to)
  setPath(to)
  scrollTo(0, 0)
}
addEventListener('popstate', () => setPath(location.pathname))

// links within the field are followed in place; data and the world outside open as themselves
document.addEventListener('click', e => {
  const a = (e.target as Element).closest?.('a')
  if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const to = new URL(a.href)
  if (to.origin !== location.origin || to.pathname.startsWith('/field')) return
  e.preventDefault()
  go(to.pathname)
})

// ---------------------------------------------------------------- saying things plainly

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function date(v: any) {
  if (v == null) return ''
  const s = String(v)
  if (s === 'present') return s
  const [y, m, d] = s.slice(0, 10).split('-')
  return d ? `${+d} ${months[+m - 1]} ${y}` : m ? `${months[+m - 1]} ${y}` : y
}
export const time = (iso: string) => `${date(iso)}, ${iso.slice(11, 16)}`
