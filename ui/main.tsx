// The interface: which arrangement draws where we are, and the holon it is handed.

import { createEffect, createMemo, Show } from 'solid-js'
import { render } from 'solid-js/web'
import { all, connect, get, idOf, loaded, path } from './field'
import { Mount } from './mount'
import { Inspect } from './inspect'
import './layout'
import './expressive'
import './reader'

function App() {
  const reading = () => path().startsWith('/~')
  const id = () => (reading() ? '/' : idOf(path()))
  // an arrangement made for this holon at this path stands over the one for every holon
  const arrangement = createMemo(() => {
    const arrangements = all().filter(h => h.data.layout)
    if (reading()) return arrangements.find(a => a.data.path === '/~')
    return (
      arrangements.find(a => a.data.holon === id() && a.data.path && idOf(a.data.path) === idOf(path())) ??
      arrangements.find(a => a.data.holon === '*' && !a.data.path)
    )
  })
  createEffect(() => {
    const h = get(reading() ? idOf(path().slice(2) || '/') : id())
    const name = get('/')?.title ?? ''
    document.title = reading() ? `${h?.title ?? 'The field'} · the field` : !h || h.id === '/' ? name : `${h.title} · ${name}`
  })
  return (
    <Show when={loaded()}>
      <Show when={get(id())} fallback={<main class="column"><p class="fault">Nothing stands at {id()}</p></main>}>
        {h => (
          <Show when={arrangement()} fallback={<p class="fault">No arrangement draws {id()}</p>}>
            {a => <Mount m={a().data.layout} h={h()} at={{ arrangement: a().id, path: [] }} />}
          </Show>
        )}
      </Show>
    </Show>
  )
}

render(() => (
  <>
    <App />
    <Inspect />
  </>
), document.getElementById('root')!)
connect()
