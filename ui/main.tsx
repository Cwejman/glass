// The interface: one address, where we are, and the view drawing from it. A view is an arrangement:
// the one named by ?as=, or one made for this holon at this path, or the one for every holon.

import { createEffect, createMemo, Show } from 'solid-js'
import { render } from 'solid-js/web'
import { address, all, connect, get, idOf, loaded, path, view } from './field'
import { Mount } from './mount'
import { Chrome } from './chrome'
import { SourceView } from './views'
import './layout'
import './expressive'
import './faces'

function App() {
  const arrangement = createMemo(() => {
    const arrangements = all().filter(h => h.data.layout)
    if (view()) return arrangements.find(a => a.data.as === view())
    return (
      arrangements.find(a => a.data.holon === address() && a.data.path && idOf(a.data.path) === address()) ??
      arrangements.find(a => a.data.holon === '*' && !a.data.path && !a.data.as)
    )
  })
  createEffect(() => {
    const name = get('/')?.title ?? ''
    const h = get(address())
    document.title = path().startsWith('/~code/') ? `${path().slice(7)} · ${name}` : !h || h.id === '/' ? name : `${h.title} · ${name}`
  })
  return (
    <Show when={loaded()}>
      <Show when={!path().startsWith('/~code')} fallback={<SourceView />}>
        <Show when={get(address())} fallback={<main class="column"><p class="fault">Nothing stands at {address()}</p></main>}>
          {h => (
            <Show when={arrangement()} fallback={<p class="fault">No arrangement draws {view() || address()}</p>}>
              {a => <Mount m={a().data.layout} h={h()} at={{ arrangement: a().id, path: [] }} />}
            </Show>
          )}
        </Show>
      </Show>
    </Show>
  )
}

render(
  () => (
    <>
      <App />
      <Chrome />
    </>
  ),
  document.getElementById('root')!,
)
connect()
