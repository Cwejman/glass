// The field: every holon, held in SQLite, and every change to it as a commit.
// Nothing is changed but by a commit, and every commit says by whom, when, and what it touched.

import { Database } from 'bun:sqlite'

export type Holon = {
  id: string
  above: string | null
  title: string
  data: Record<string, any>
  prose: string
  born: string
  changed: string
}

export type Commit = { seq: number; at: string; by: string; touched: string; effect: any }

// an effect is what a program asks for; only a commit carries it out
export type Effect =
  | { put: { id: string; title?: string; data?: Record<string, any>; prose?: string } }
  | { add: { beneath: string; title?: string; data?: Record<string, any>; prose?: string } }

export const aboveOf = (id: string) => (id === '/' ? null : id.slice(0, id.lastIndexOf('/')) || '/')

export function open(path: string) {
  const db = new Database(path, { create: true })
  db.exec(`
    pragma journal_mode = wal;
    create table if not exists holon (
      id text primary key, above text, title text not null,
      data text not null, prose text not null, born text not null, changed text not null
    );
    create index if not exists holon_above on holon(above);
    create table if not exists commits (
      seq integer primary key autoincrement, at text not null, by text not null,
      touched text not null, effect text not null
    );
    create index if not exists commits_touched on commits(touched);
  `)

  const row = (r: any): Holon | undefined =>
    r && { ...r, data: JSON.parse(r.data) }
  const q = {
    get: db.query('select * from holon where id = ?'),
    all: db.query('select * from holon order by id'),
    beneath: db.query('select * from holon where above = ? order by id'),
    put: db.query(`insert into holon (id, above, title, data, prose, born, changed) values ($id, $above, $title, $data, $prose, $at, $at)
      on conflict(id) do update set title = $title, data = $data, prose = $prose, changed = $at`),
    commit: db.query('insert into commits (at, by, touched, effect) values (?, ?, ?, ?) returning seq'),
    history: db.query('select * from commits where touched = ? order by seq'),
    since: db.query('select * from commits where seq > ? order by seq limit ?'),
  }

  const listeners = new Set<(c: Commit, touched: Holon) => void>()
  let stamp = 0

  const field = {
    get: (id: string) => row(q.get.get(id)),
    all: () => (q.all.all() as any[]).map(row) as Holon[],
    beneath(id: string) {
      const list = (q.beneath.all(id) as any[]).map(row) as Holon[]
      // beneath stands in the order its holon names, and the rest after, by name
      const named: string[] = (field.get(id)?.data.beneath ?? []).map((n: string) => (id === '/' ? '' : id) + '/' + n)
      const rank = (h: Holon) => (named.includes(h.id) ? named.indexOf(h.id) : named.length)
      return list.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
    },
    history: (id: string) => (q.history.all(id) as any[]).map(c => ({ ...c, effect: JSON.parse(c.effect) })) as Commit[],
    since: (seq: number, limit = 200) => (q.since.all(seq, limit) as any[]).map(c => ({ ...c, effect: JSON.parse(c.effect) })) as Commit[],
    listen: (f: (c: Commit, touched: Holon) => void) => (listeners.add(f), () => listeners.delete(f)),

    // carry out one effect as one commit; the caller has already asked the field whether it may
    commit(by: string, effect: Effect): { commit: Commit; holon: Holon } {
      const at = new Date().toISOString()
      const run = db.transaction(() => {
        let id: string, title: string, data: Record<string, any>, prose: string
        if ('put' in effect) {
          id = effect.put.id
          title = effect.put.title ?? id
          data = effect.put.data ?? {}
          prose = effect.put.prose ?? ''
        } else {
          const { beneath } = effect.add
          // a name from the moment it came, made unique within its place
          const base = at.slice(0, 19).replace(/[:T]/g, '-')
          id = (beneath === '/' ? '' : beneath) + '/' + base
          for (let n = 2; field.get(id); n++) id = (beneath === '/' ? '' : beneath) + '/' + base + '-' + n
          prose = effect.add.prose ?? ''
          title = effect.add.title ?? (prose.split(/\s+/).slice(0, 6).join(' ') || base)
          data = effect.add.data ?? {}
        }
        if (id !== '/' && !field.get(aboveOf(id)!)) throw new Error(`nothing stands at ${aboveOf(id)} to hold ${id}`)
        q.put.run({ $id: id, $above: aboveOf(id), $title: title, $data: JSON.stringify(data), $prose: prose, $at: at })
        const { seq } = q.commit.get(at, by, id, JSON.stringify(effect)) as any
        return { commit: { seq, at, by, touched: id, effect }, holon: field.get(id)! }
      })
      const done = run()
      stamp++
      for (const f of listeners) f(done.commit, done.holon)
      return done
    },

    // how many commits have been made since the field was opened; a cheap mark of change
    get stamp() {
      return stamp
    },
  }
  return field
}

export type Field = ReturnType<typeof open>

// a type is a holon holding a shape; a holon that has the shape is of the type
export function typesOf(field: Field, h: Holon) {
  return field
    .beneath('/types')
    .filter(t => (t.data.shape?.has ?? []).every((k: string) => h.data[k] != null))
    .map(t => t.id)
}

// what the field declares: a place says which programs may add beneath it
export function mayAdd(field: Field, by: string, beneath: string) {
  const open = field.get(beneath)?.data.open
  return Array.isArray(open?.add) && open.add.includes(by)
}

// and which programs may put a holon, declared on the holon or the nearest place above it that says
export function mayPut(field: Field, by: string, id: string) {
  for (let at: string | null = id; at; at = aboveOf(at)) {
    const put = field.get(at)?.data.open?.put
    if (put) return Array.isArray(put) && put.includes(by)
  }
  return false
}
