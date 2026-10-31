// The reader: the field explored as it is. Places to the side, and the holon whole:
// its types, its data, its words, what it holds and links, and every commit that made it. Live as the field changes.

import { createResource, createSignal, For, Show } from 'solid-js'
import { register, type C } from './mount'
import { get, href, idOf, path, time, lastCommit, type Commit } from './field'

const at = (id: string) => '/~' + href(id)
const here = () => idOf(path().replace(/^\/~/, '') || '/')

const [opened, setOpened] = createSignal(new Set<string>(['/']))
const toggle = (id: string) => setOpened(s => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))))

// a place opens when it is read, and its ancestors with it
function openTo(id: string) {
  const s = new Set(opened())
  for (let x: string | null | undefined = id; x; x = get(x)?.above) s.add(x)
  if ([...s].some(x => !opened().has(x))) setOpened(s)
}

function Place(p: { id: string }) {
  const h = () => get(p.id)
  return (
    <Show when={h()}>
      {h => (
        <li>
          <span class="place" classList={{ here: here() === p.id }}>
            <Show when={h().beneath.length} fallback={<i class="twig" />}>
              <button class="twig" onClick={() => toggle(p.id)} aria-label={opened().has(p.id) ? 'close' : 'open'}>
                {opened().has(p.id) ? '−' : '+'}
              </button>
            </Show>
            <a href={at(p.id)}>{h().title}</a>
            <Show when={h().beneath.length}><small>{h().beneath.length}</small></Show>
          </span>
          <Show when={opened().has(p.id) && h().beneath.length}>
            <ul>
              <For each={h().beneath}>{id => <Place id={id} />}</For>
            </ul>
          </Show>
        </li>
      )}
    </Show>
  )
}

// a value as it is held; a string naming a holon becomes the way to it
function Value(p: { v: any }) {
  const v = p.v
  if (typeof v === 'string' && v.startsWith('/') && get(idOf(v))) return <a href={at(idOf(v))}>{v}</a>
  if (Array.isArray(v) && v.every(x => typeof x === 'string'))
    return <span class="values"><For each={v}>{x => <Value v={x} />}</For></span>
  if (v && typeof v === 'object') return <pre>{JSON.stringify(v, null, 2)}</pre>
  return <code>{String(v)}</code>
}

const Ids = (p: { label: string; ids: string[] }) => (
  <Show when={p.ids.length}>
    <section class="ids">
      <h3>{p.label} <small>{p.ids.length}</small></h3>
      <ul>
        <For each={p.ids}>
          {id => (
            <li>
              <a href={at(id)}>{get(id)?.title ?? id}</a>
              <Show when={get(id)?.data.agent}><small>{get(id)!.data.agent}</small></Show>
            </li>
          )}
        </For>
      </ul>
    </section>
  </Show>
)

function Commits(p: { id: string; count: number }) {
  // asked again whenever the holon has been touched by another commit
  const [commits] = createResource(() => [p.id, p.count] as const, ([id]) => fetch('/field' + (id === '/' ? '' : id)).then(r => r.json()).then(h => h.commits as Commit[]))
  return (
    <section class="ids">
      <h3>Commits <small>{p.count}</small></h3>
      <ol class="commits">
        <For each={[...(commits() ?? [])].reverse()}>
          {c => (
            <li>
              <span>#{c.seq}</span> {time(c.at)} <span>by</span> <a href={at(c.by)}>{c.by}</a> <span>{'put' in c.effect ? 'put' : 'add'}</span>
            </li>
          )}
        </For>
      </ol>
    </section>
  )
}

const reader: C = () => {
  const h = () => get(here())
  const chain = () => {
    const ids: string[] = []
    for (let id = h()?.above; id; id = get(id)?.above ?? null) ids.unshift(id)
    return ids
  }
  return (
    <div class="reader">
      <header class="bar">
        <a href="/">{get('/')?.title}</a>
        <Show when={lastCommit()}>
          {c => (
            <span class="pulse">
              #{c().seq} {c().by} → <a href={at(c().touched)}>{c().touched}</a>
            </span>
          )}
        </Show>
      </header>
      <nav class="tree">
        <ul>
          <Place id="/" />
        </ul>
      </nav>
      <section class="read">
        <Show when={h()} fallback={<p class="fault">Nothing stands at {here()}</p>}>
          {h => {
            openTo(h().id)
            return (
              <>
                <nav class="crumbs">
                  <For each={chain()}>{id => <a href={at(id)}>{get(id)?.title}</a>}</For>
                </nav>
                <h1>{h().title}</h1>
                <p class="identity">
                  <code>{h().id}</code>
                  <For each={h().types}>{t => <a class="badge" href={at(t)}>{get(t)?.title}</a>}</For>
                </p>
                <Show when={h().html}><div class="words" innerHTML={h().html} /></Show>
                <Show when={Object.keys(h().data).length}>
                  <table class="data">
                    <tbody>
                      <For each={Object.entries(h().data)}>
                        {([k, v]) => (
                          <tr>
                            <th>{k}</th>
                            <td><Value v={v} /></td>
                          </tr>
                        )}
                      </For>
                    </tbody>
                  </table>
                </Show>
                <Ids label="Beneath" ids={h().beneath} />
                <Ids label="Links to" ids={h().links.filter(id => get(id))} />
                <Ids label="Linked from" ids={h().linked} />
                <Commits id={h().id} count={h().history.commits} />
                <p class="ways">
                  <a href={href(h().id)}>As drawn</a> · <a href={'/field' + (h().id === '/' ? '' : h().id)}>As data</a>
                </p>
              </>
            )
          }}
        </Show>
      </section>
    </div>
  )
}

register({ reader })
