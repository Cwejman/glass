// The field is born once from the markdown it grew in, and from here on the field is the source.
// `bun src/import.ts` makes field.db from the markdown kept in .stale/markdown; it refuses to run over a field that already holds anything.

import { readdir, readFile } from 'node:fs/promises'
import { join, relative, dirname, resolve, extname } from 'node:path'
import { open, type Field } from './field'

const root = resolve(import.meta.dir, '..')
const field: Field = open(join(root, 'field.db'))
const seed = join(root, '.stale/markdown')
if (field.all().length) throw new Error('the field already holds holons; it is born only once')

const skip = new Set(['drawers'])
const leave = new Set(['drawing/cv.md', 'drawing/README.md'])

async function walk(dir: string): Promise<string[]> {
  const files: string[] = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || skip.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) files.push(...(await walk(p)))
    else if (extname(e.name) === '.md' && !leave.has(relative(seed, p))) files.push(p)
  }
  return files
}

const idOf = (file: string) => '/' + relative(seed, file).replace(/\.md$/, '').replace(/(^|\/)README$/, '')
const day = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)

type Seed = { id: string; title: string; data?: Record<string, any>; prose?: string }
const seeds: Seed[] = []

for (const file of await walk(seed)) {
  const text = await readFile(file, 'utf8')
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/)
  const data: Record<string, any> = fm ? ((Bun.YAML.parse(fm[1]) as any) ?? {}) : {}
  for (const k of Object.keys(data)) data[k] = day(data[k])
  let body = fm ? text.slice(fm[0].length) : text
  const h1 = body.match(/^\s*# (.+)\n/)
  const title = h1 ? h1[1].trim() : idOf(file)
  if (h1) body = body.slice(h1[0].length)
  // links between holons become links to their place in the field
  let prose = body.trim().replace(/\]\(([^)#\s:]+\.md)(#[^)]*)?\)/g, (_, to) => `](${idOf(resolve(dirname(file), to))})`)
  // a program's code is held as data, not as prose
  const code = prose.match(/```ts\n([\s\S]*?)```/)
  if (code && idOf(file).startsWith('/programs/')) (data.code = code[1]), (prose = prose.replace(code[0], '').trim())
  seeds.push({ id: idOf(file), title, data, prose })
}

const at = (id: string) => seeds.find(s => s.id === id)!

// the layouts drawn by the old drawers, mounted now on the components: the field drawer is columns, data is part of open
const remount = (m: any): any => m.draw === 'data' ? null
  : { ...m, draw: m.draw === 'field' ? 'columns' : m.draw, ...(m.of && { of: m.of.map(remount).filter(Boolean) }) }
for (const s of seeds) if (s.data?.layout) s.data.layout = remount(s.data.layout)

// notes are open to the note program, and only to it
at('/notes').data!.open = { add: ['/programs/note'] }
at('/').data!.beneath = ['primitives', 'notes', 'traffic', 'claims', 'makings', 'play', 'said', 'programs', 'components', 'types', 'drawing']

seeds.push(
  {
    id: '/traffic',
    title: 'Traffic',
    data: { shows: ['/primitives/field', '/primitives/effect'] },
    prose: 'Every request that reaches the engine, kept as a visit, a day at a time: when, where to, from where, and what kind of browser. Never who.',
  },
  {
    id: '/types',
    title: 'Types',
    data: { beneath: ['arrangement', 'program', 'component', 'visit', 'said'] },
    prose: 'Each type is a shape, held here as a holon. A holon that has the shape is of the type.',
  },
  { id: '/types/arrangement', title: 'Arrangement', data: { shape: { has: ['layout'] } }, prose: 'Holds a layout: a tree of mounts, each naming a component and the holon it is handed.' },
  { id: '/types/program', title: 'Program', data: { shape: { has: ['code'] } }, prose: 'Holds code, and returns the effect it wants.' },
  { id: '/types/component', title: 'Component', data: { shape: { has: ['takes'] } }, prose: 'Says what it takes, and draws it.' },
  { id: '/types/visit', title: 'Visit', data: { shape: { has: ['visit'] } }, prose: 'A request that reached the engine.' },
  { id: '/types/said', title: 'Said', data: { shape: { has: ['said'] } }, prose: 'Words kept as they were said, with the day they were said.' },
  {
    id: '/drawing',
    title: 'How this is drawn',
    data: { beneath: ['home', 'site', 'reader'] },
    prose:
      'Nothing here is written as a page. Components draw holons, and a holon that holds a layout is an arrangement: a tree of mounts, each naming a component and the holon it is handed. Each component encloses, and opens a space for the next holarchy, where components matched by type draw in turn.\n\n[Home](/drawing/home) draws the root as the first page anyone meets. [The site](/drawing/site) draws every holon on its own page. [The reader](/drawing/reader) is the way into the whole field, as it is.',
  },
  {
    id: '/drawing/reader',
    title: 'The reader',
    data: { holon: '*', path: '/~', layout: { draw: 'reader' } },
    prose: 'The field as it is: every place, every holon, what it holds, what it links, and every commit that made it. Open at /~, and at /~ followed by any holon.',
  },
  {
    id: '/components',
    title: 'Components',
    data: { beneath: ['column', 'list', 'split', 'columns', 'holon', 'act', 'bar', 'path', 'linked', 'open', 'reader'] },
    prose: 'What draws. Each says what it takes, as a type, and is mounted by name or found by what fits. Their code is TSX, compiled into the interface; what they are is said here.',
  },
  ...[
    ['column', 'any', 'A reading column, holding the mounts it is given, one after another.'],
    ['list', 'any', 'Mounts in a line, down or across, wrapping or not.'],
    ['split', 'any', 'Two mounts side by side, sharing the space by a ratio.'],
    ['columns', 'any', 'What stands beneath a holon, set in columns the way a broadsheet sets its stories.'],
    ['holon', 'any', 'One holon, drawn for what it is: its words given room by how much they say, its relations, and the words it grew from.'],
    ['act', 'any', 'Where a holon is open to a program, offers it.'],
    ['bar', 'any', 'The name, and the ways into the field.'],
    ['path', 'any', 'The way down from the root to the holon.'],
    ['linked', 'any', 'What speaks of the holon.'],
    ['open', 'any', 'The holon as data, and its history.'],
    ['reader', 'any', 'The field explored: places to the side, the holon whole, its data, its links and its commits.'],
  ].map(([name, takes, prose]) => ({ id: `/components/${name}`, title: name, data: { takes }, prose })),
)

// parents before children, so every holon has a place to stand
for (const s of seeds.sort((a, b) => a.id.split('/').length - b.id.split('/').length || a.id.localeCompare(b.id)))
  field.commit('/import', { put: { id: s.id, title: s.title, data: s.data ?? {}, prose: s.prose ?? '' } })

console.log(`glass: the field is born with ${field.all().length} holons`)
