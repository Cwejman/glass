// The engine: holds the field, answers what is asked of it, tells every page when it changes,
// runs programs, and carries out their effects where the field declares itself open to them.
// Every request that reaches it is recorded in the field as a visit, so the traffic is data like any other.
// `bun src/engine.ts` serves at http://localhost:4321.

import { watch } from 'node:fs'
import { writeFile, rm, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { open, typesOf, mayAdd, mayDo, aboveOf, type Holon, type Effect } from './field'
import { buildInterface } from './build'

const root = resolve(import.meta.dir, '..')
const field = open(join(root, 'field.db'))
const port = 4321

// ---------------------------------------------------------------- reading

// what links a holon makes, from the links in its prose
const linksOf = (h: Holon) => [...new Set([...h.prose.matchAll(/\]\((\/[^)\s#?]*)/g)].map(m => m[1].replace(/\/$/, '') || '/'))]

let linkedCache = { stamp: -1, map: new Map<string, string[]>() }
function linkedTo(id: string) {
  if (linkedCache.stamp !== field.stamp) {
    const map = new Map<string, string[]>()
    for (const h of field.all()) for (const to of linksOf(h)) map.set(to, [...(map.get(to) ?? []), h.id])
    linkedCache = { stamp: field.stamp, map }
  }
  return linkedCache.map.get(id) ?? []
}

// a holon as the interface receives it: as stored, and what is derived from it
function face(h: Holon) {
  const history = field.history(h.id)
  return {
    ...h,
    html: h.prose ? Bun.markdown.html(h.prose) : '',
    beneath: field.beneath(h.id).map(b => b.id),
    links: linksOf(h),
    linked: linkedTo(h.id),
    types: typesOf(field, h),
    history: { commits: history.length, first: history[0]?.at, last: history.at(-1)?.at },
  }
}

// ---------------------------------------------------------------- acting

// a program is a holon beneath /programs holding code; it returns the effect it wants and carries out nothing
async function run(id: string, input: any): Promise<Effect> {
  const p = field.get(id)
  if (!p?.id.startsWith('/programs/') || typeof p.data.code !== 'string') throw new Error(`no program at ${id}`)
  const path = join(tmpdir(), `glass-${p.id.replaceAll('/', '-')}-${Date.now()}.ts`)
  await writeFile(path, p.data.code)
  try {
    return await (await import(path)).default(input ?? {})
  } finally {
    await rm(path, { force: true })
  }
}

// the engine carries out an effect only where the field declares it open to whoever asks
function apply(by: string, effect: Effect) {
  if ('remove' in effect) {
    if (!mayDo(field, 'remove', by, effect.remove.id)) throw new Error(`${effect.remove.id} is not open to ${by} removing it`)
    return field.commit(by, effect)
  }
  if ('put' in effect) {
    const { id } = effect.put
    if (!mayDo(field, 'put', by, id)) throw new Error(`${id} is not open to ${by}`)
    // what a put leaves unsaid stays as it was, and the commit keeps the whole of what the holon became
    const was = field.get(id)
    return field.commit(by, {
      put: { id, title: effect.put.title ?? was?.title ?? id, data: effect.put.data ?? was?.data ?? {}, prose: effect.put.prose ?? was?.prose ?? '' },
    })
  }
  if (!mayAdd(field, by, effect.add.beneath)) throw new Error(`${effect.add.beneath} is not open to ${by}`)
  return field.commit(by, effect)
}

// ---------------------------------------------------------------- traffic

// a visit keeps what is plain about it: when, where to, from where, and what kind of browser; never who
function agentOf(ua: string) {
  const browser = /bot|crawl|spider/i.test(ua) ? 'a crawler'
    : /curl|wget|fetch|http/i.test(ua) && !/mozilla/i.test(ua) ? 'a program'
    : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'a browser'
  const system = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return system ? `${browser} on ${system}` : browser
}

function record(req: Request, path: string) {
  const day = new Date().toISOString().slice(0, 10)
  const place = `/traffic/${day}`
  if (!field.get(place)) field.commit('/engine', { put: { id: place, title: day, data: { day, open: { add: ['/engine'] } } } })
  const referrer = req.headers.get('referer')
  apply('/engine', {
    add: {
      beneath: place,
      title: path,
      data: { visit: path, at: new Date().toISOString(), agent: agentOf(req.headers.get('user-agent') ?? ''), ...(referrer && { referrer }) },
    },
  })
}

// ---------------------------------------------------------------- source

// what is open to read: the engine, the interface, and how they are put together; nothing else on the machine
async function sources() {
  const within = async (dir: string) =>
    (await readdir(join(root, dir))).filter(f => /\.(tsx?|css)$/.test(f)).sort().map(f => `${dir}/${f}`)
  return [...(await within('src')), ...(await within('ui')), 'package.json', 'tsconfig.json', 'README.md']
}

// where a component's code stands: the file that registers it, and the lines that define it with the words above them
async function sourceOf(name: string) {
  for (const file of (await sources()).filter(f => f.startsWith('ui/'))) {
    const text = await Bun.file(join(root, file)).text()
    const registered = text.match(/register\(\{([^}]*)\}\)/)?.[1]
    const local = registered
      ?.split(',')
      .map(s => s.split(':').map(x => x.trim()))
      .find(([n]) => n === name)
    if (!local) continue
    const lines = text.split('\n')
    const start = lines.findIndex(l => new RegExp(`^(const|function) ${local.at(-1)}\\b`).test(l))
    if (start < 0) continue
    let from = start
    while (from > 0 && lines[from - 1].startsWith('//')) from--
    let to = start + 1
    while (to < lines.length && !/^(const |function |export |register\(|\/\/ )/.test(lines[to])) to++
    while (to > start + 1 && lines[to - 1].trim() === '') to--
    return { file, from: from + 1, to, code: lines.slice(from, to).join('\n') }
  }
}

// ---------------------------------------------------------------- serving

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jona Cwejman</title>
<link rel="stylesheet" href="/glass.css">
<script type="module" src="/app.js"></script>
</head>
<body><div id="root"></div></body>
</html>
`

await buildInterface(root)

const server = Bun.serve({
  port,
  hostname: 'localhost',
  async fetch(req, server) {
    const path = decodeURIComponent(new URL(req.url).pathname)

    if (path === '/live') return server.upgrade(req) ? undefined : new Response('a socket was expected', { status: 400 })
    if (path === '/app.js') return new Response(Bun.file(join(root, 'dist/app.js')), { headers: { 'content-type': 'text/javascript' } })
    if (path === '/glass.css') return new Response(Bun.file(join(root, 'src/glass.css')))

    // the field as data: all of it, or one holon, or the commits since a point
    if (path === '/field') return Response.json(field.all().map(face))
    if (path === '/commits') return Response.json(field.since(Number(new URL(req.url).searchParams.get('after') ?? 0)))
    if (path.startsWith('/field/')) {
      const h = field.get(path.slice(6).replace(/\/$/, '') || '/')
      return h ? Response.json({ ...face(h), commits: field.history(h.id) }) : new Response('nothing stands there', { status: 404 })
    }

    // the engine's own code and the interface's, readable as they are
    if (path === '/source') {
      const component = new URL(req.url).searchParams.get('component')
      if (component) {
        const found = await sourceOf(component)
        return found ? Response.json(found) : new Response(`no source for ${component}`, { status: 404 })
      }
      return Response.json(await sources())
    }
    if (path.startsWith('/source/')) {
      const file = path.slice(8)
      return (await sources()).includes(file)
        ? new Response(Bun.file(join(root, file)), { headers: { 'content-type': 'text/plain; charset=utf-8' } })
        : new Response('not a source file', { status: 404 })
    }

    if (path === '/act' && req.method === 'POST') {
      try {
        const { program, input } = await req.json()
        return Response.json(apply(program, await run(program, input)))
      } catch (e: any) {
        return new Response(e.message, { status: 400 })
      }
    }

    // every page is the interface; it asks the field for what to draw
    if (req.method === 'GET' && (req.headers.get('accept') ?? '').includes('text/html')) {
      record(req, path)
      return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    return new Response('nothing stands there', { status: 404 })
  },
  websocket: {
    open: ws => void ws.subscribe('field'),
    message() {},
  },
})

// every commit is told to every page: the holon it touched, the place that holds it, and what it links to
field.listen((commit, touched) => {
  const ids = new Set([touched.id, aboveOf(touched.id), ...linksOf(touched)].filter(Boolean) as string[])
  const holons = [...ids].map(id => field.get(id)).filter(Boolean).map(h => face(h!))
  const removed = 'remove' in commit.effect ? touched.id : undefined
  server.publish('field', JSON.stringify({ commit, holons, removed }))
})

// the interface is rebuilt when its source changes, and the pages are told to load it again
let pending: Timer | undefined
watch(join(root, 'ui'), { recursive: true }, () => {
  clearTimeout(pending)
  pending = setTimeout(() => buildInterface(root).then(() => server.publish('field', JSON.stringify({ reload: true }))).catch(e => console.error(e)), 80)
})

console.log(`glass: the field holds ${field.all().length} holons, serving at http://localhost:${port}`)
