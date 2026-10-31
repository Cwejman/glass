// Layout components: they hold other mounts and give them space, and draw nothing of their own.

import { For, Show } from 'solid-js'
import { register, Mount, Within, type C } from './mount'
import { href } from './field'

const column: C = p => (
  <main class="column">
    <Within m={p.m} h={p.h} />
  </main>
)

// in a line, down or across, wrapping or not
const list: C = p => (
  <div class="list" classList={{ across: p.m.direction === 'across', wrap: !!p.m.wrap }}>
    <Within m={p.m} h={p.h} />
  </div>
)

// two mounts sharing the space by a ratio
const split: C = p => (
  <div class="split" classList={{ down: p.m.direction === 'down' }} style={{ '--ratio': String(p.m.ratio ?? 0.5) }}>
    <Within m={p.m} h={p.h} />
  </div>
)

// what stands beneath a holon, in the order it gives and only what it names where it names any, set as a broadsheet
const columns: C = p => {
  const ids = () => {
    const named: string[] | undefined = p.h.data.beneath?.map((n: string) => (p.h.id === '/' ? '' : p.h.id) + '/' + n)
    return named ? p.h.beneath.filter(id => named.includes(id)) : p.h.beneath
  }
  return (
    <Show when={ids().length}>
      <section class="field-wrap">
        <Show when={p.m.label}>
          <header class="field-head">
            <h2>
              <a href={href(p.h.id)}>{p.h.title}</a>
            </h2>
            <Show when={lead(p.h.html)}>{l => <p innerHTML={l()} />}</Show>
          </header>
        </Show>
        <div class="field" classList={{ narrow: !!p.m.narrow }}>
          <For each={ids()}>{id => <Mount m={{ draw: 'holon', holon: id, bare: p.m.bare }} h={p.h} />}</For>
        </div>
      </section>
    </Show>
  )
}

// a holon's opening words, as drawn
const lead = (html: string) => html.match(/<p>([\s\S]*?)<\/p>/)?.[1]

register({ column, list, split, columns })
