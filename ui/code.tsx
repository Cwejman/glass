// Code, read as it is: TypeScript, TSX, CSS and JSON, lines numbered, marked quietly by kind.
// Anything held outside the field, the engine's own source among it, is read here the same way.

import { createEffect, createMemo, createResource, For, Show } from 'solid-js'

type Kind = 'comment' | 'string' | 'key' | 'number' | 'keyword' | 'tag' | 'name' | 'plain'

const rules: [Kind, RegExp][] = [
  ['comment', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
  ['string', /'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/y],
  ['number', /\b\d+(?:\.\d+)?\b/y],
  [
    'keyword',
    /\b(?:import|from|export|default|const|let|var|function|return|if|else|for|of|in|while|new|throw|try|catch|finally|async|await|type|typeof|as|true|false|null|undefined|this|class|extends|void|delete)\b/y,
  ],
  ['tag', /<\/?[A-Za-z][\w.]*|\/>/y],
  ['name', /[A-Za-z_$][\w$-]*/y],
  ['plain', /\s+|[^\sA-Za-z_$\d'"`/<]+|./y],
]

const escape = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)

// tokens as lines of html, a token that spans lines carried onto each of them
export function highlight(text: string, lang: string) {
  const lines: string[] = ['']
  const json = lang === 'json'
  for (let i = 0; i < text.length; ) {
    let kind: Kind = 'plain'
    let token = text[i]
    for (const [k, re] of rules) {
      if (json && (k === 'comment' || k === 'tag')) continue
      re.lastIndex = i
      const m = re.exec(text)
      if (m) {
        ;(kind = k), (token = m[0])
        break
      }
    }
    // in JSON, and in CSS, a string or name standing before a colon is a key
    if ((json && kind === 'string') || (lang === 'css' && kind === 'name')) if (/^\s*:/.test(text.slice(i + token.length))) kind = 'key'
    i += token.length
    token.split('\n').forEach((piece, n) => {
      if (n) lines.push('')
      if (piece) lines[lines.length - 1] += kind === 'plain' || kind === 'name' ? escape(piece) : `<span class="t-${kind}">${escape(piece)}</span>`
    })
  }
  return lines
}

export const langOf = (file: string) => (file.endsWith('.json') ? 'json' : file.endsWith('.css') ? 'css' : file.endsWith('.md') ? 'md' : 'ts')

export function Code(p: { text: string; lang?: string; from?: number }) {
  const lines = createMemo(() => highlight(p.text, p.lang ?? 'ts'))
  return (
    <pre class="code">
      <code>
        <For each={lines()}>
          {(line, i) => (
            <span class="line" id={`L${(p.from ?? 1) + i()}`}>
              <span class="no">{(p.from ?? 1) + i()}</span>
              <span innerHTML={line || ' '} />
            </span>
          )}
        </For>
      </code>
    </pre>
  )
}

// a component's own code, found where it is registered
export function ComponentSource(p: { name: string }) {
  const [found] = createResource(
    () => p.name,
    name => fetch(`/source?component=${encodeURIComponent(name)}`).then(r => (r.ok ? r.json() : undefined)),
  )
  return (
    <Show when={found()} fallback={<p class="quiet">{found.loading ? '' : `No source found for ${p.name}.`}</p>}>
      {f => (
        <>
          <p class="quiet">
            <a href={`/~code/${f().file}#L${f().from}`}>{f().file}</a>, lines {f().from}–{f().to}
          </p>
          <Code text={f().code} from={f().from} lang="ts" />
        </>
      )}
    </Show>
  )
}

// a whole file the engine offers to be read
export function SourceFile(p: { file: string }) {
  const [text] = createResource(
    () => p.file,
    file => fetch(`/source/${file}`).then(r => (r.ok ? r.text() : undefined)),
  )
  // a line named in the address is brought into view once the file is drawn
  createEffect(() => {
    if (text() === undefined) return
    requestAnimationFrame(() => {
      const line = location.hash && document.getElementById(location.hash.slice(1))
      if (!line) return
      line.classList.add('aimed')
      line.scrollIntoView({ block: 'center' })
    })
  })
  return (
    <Show when={text() !== undefined} fallback={<p class="fault">{text.loading ? '' : `${p.file} is not offered to be read`}</p>}>
      <Code text={text()!} lang={langOf(p.file)} />
    </Show>
  )
}
