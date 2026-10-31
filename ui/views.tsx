// Views: root components, each drawing the field from the one address, where we are.
// levels lays a card for every level from the root down to the address, each child drawn by the component its type finds;
// tree lays the holarchy beside the holon. The bar names the views, and moving between them keeps the address.

import { createEffect, createResource, createSignal, For, Show } from 'solid-js'
import { register, Mount, type C } from './mount'
import { address, get, link, path, view, lastCommit } from './field'
import { SourceFile } from './code'
import { why } from './edit'

const views = [
  ['', 'Page'],
  ['field', 'Field'],
  ['tree', 'Tree'],
]

export const Bar = () => (
  <header class="bar">
    <a href="/">{address() === '/' && !view() ? '' : get('/')?.title}</a>
    <Show when={lastCommit()}>
      {c => (
        <span class="pulse">
          #{c().seq} {c().by} → <a href={link(c().touched)}>{get(c().touched)?.title ?? c().touched}</a>
        </span>
      )}
    </Show>
    <nav>
      <For each={views}>
        {([as, name]) => (
          <a href={link(address(), as)} classList={{ here: view() === as && !path().startsWith('/~code') }}>
            {name}
          </a>
        )}
      </For>
    </nav>
    <Show when={why()}><p class="why">{why()}</p></Show>
  </header>
)

const ancestry = (id: string) => {
  const ids: string[] = []
  for (let at: string | null | undefined = id; at; at = get(at)?.above) ids.unshift(at)
  return ids
}

// a card for every level, from the root down to the address; the last is the holon whole, with what it holds beneath it
const levels: C = p => {
  let strip!: HTMLDivElement
  createEffect(() => {
    p.h.id
    requestAnimationFrame(() => strip?.scrollTo({ left: strip.scrollWidth, behavior: 'smooth' }))
  })
  const above = () => ancestry(p.h.id).slice(0, -1)
  return (
    <div class="levels-view">
      <Bar />
      <div class="levels" ref={strip}>
        <For each={above()}>
          {(id, i) => (
            <section class="level">
              <header>
                <a href={link(id)}>{get(id)?.title}</a>
              </header>
              <ul>
                <For each={get(id)?.beneath ?? []}>
                  {c => (
                    <li classList={{ chosen: (above()[i() + 1] ?? p.h.id) === c }}>
                      <Mount m={{ grade: 'row' }} h={get(c)!} />
                    </li>
                  )}
                </For>
              </ul>
            </section>
          )}
        </For>
        <section class="level focus">
          <Mount m={{}} h={p.h} />
          <Show when={p.h.beneath.length}>
            <ul class="beneath">
              <For each={p.h.beneath}>{c => <li><Mount m={{ grade: 'row' }} h={get(c)!} /></li>}</For>
            </ul>
          </Show>
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the tree

const [opened, setOpened] = createSignal(new Set<string>(['/']))
const toggle = (id: string) => setOpened(s => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))))

function Place(p: { id: string }) {
  return (
    <Show when={get(p.id)}>
      {h => (
        <li>
          <span class="place" classList={{ here: address() === p.id }}>
            <Show when={h().beneath.length} fallback={<i class="twig" />}>
              <button class="twig" onClick={() => toggle(p.id)}>{opened().has(p.id) ? '−' : '+'}</button>
            </Show>
            <a href={link(p.id)}>{h().title}</a>
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

// what is held outside the field and offered to be read
function Sources() {
  const [files] = createResource(() => fetch('/source').then(r => r.json() as Promise<string[]>))
  const [open, setOpen] = createSignal(path().startsWith('/~code'))
  return (
    <ul class="sources">
      <li>
        <span class="place">
          <button class="twig" onClick={() => setOpen(!open())}>{open() ? '−' : '+'}</button>
          <span>Source</span>
          <small>{files()?.length}</small>
        </span>
        <Show when={open()}>
          <ul>
            <For each={files()}>
              {f => (
                <li>
                  <span class="place" classList={{ here: path() === '/~code/' + f }}>
                    <i class="twig" />
                    <a href={'/~code/' + f}>{f}</a>
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </li>
    </ul>
  )
}

const Tree = () => {
  createEffect(() => {
    const s = new Set(opened())
    for (const id of ancestry(address())) s.add(id)
    if ([...s].some(x => !opened().has(x))) setOpened(s)
  })
  return (
    <nav class="tree">
      <ul>
        <Place id="/" />
      </ul>
      <Sources />
    </nav>
  )
}

const tree: C = p => (
  <div class="tree-view">
    <Bar />
    <Tree />
    <section class="beside">
      <Mount m={{}} h={p.h} />
    </section>
  </div>
)

// a file of the engine or the interface, read as it is, beside the tree
export const SourceView = () => {
  const file = () => path().slice('/~code/'.length)
  return (
    <div class="tree-view">
      <Bar />
      <Tree />
      <section class="beside">
        <p class="identity">
          <code>held outside the field, read as it is</code>
          <a class="badge" href={'/source/' + file()}>raw</a>
        </p>
        <h1 class="file">{file()}</h1>
        <SourceFile file={file()} />
      </section>
    </div>
  )
}

register({ levels, tree })
