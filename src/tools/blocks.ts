// The store as blocks: reading it and adding to it. A store is a directory of
// plain files any static host can serve, and nothing written is ever changed
// but the open log volume, by appending, and the ref. vectors/README.md is the
// format; this is one implementation of it.
//
//   refs/main           "<sha256 of the last log line> <open volume>"; written last
//   log/<n>.jsonl       commits, one per line; each volume opens with a checkpoint
//   blocks/<hash>.jsonl canonical version lines, about 64 KB each
//
// A version: {id, prev, instance, name?, mould?, body}, where prev is the hash
// of the block holding the version before. A commit: {at, blocks, gone, parent,
// says}. A checkpoint is the whole latest table, so a read starts at the open
// volume and fetches nothing older until asked.

import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { join } from "node:path";
import { canonical } from "../store/canonical.ts";

// The repository's store, wherever a tool is run from.
export const storeDir = join(import.meta.dir, "../../store");

export type Holon = { id: string; instance: string[]; name?: string; mould?: any; body: any };
export type Store = Awaited<ReturnType<typeof open>>;
type BlockEntry = { first: string | null; hash: string; moved: string[]; new: number };
type Line = { at: string; blocks: BlockEntry[]; gone: string[]; parent: string | null; says: string; checkpoint?: Checkpoint; conversion?: { blocks: string[]; ids: string }; held?: [string, number][]; oldHash?: string };
type Checkpoint = { blocks: [string, string][]; gone: string[]; moved: [string, string][] };
type State = { table: [string, string][]; moved: Map<string, string>; gone: Set<string> };

export const sha = (t: string | Uint8Array) => new Bun.CryptoHasher("sha256").update(t).digest("hex");
const blockSize = 64 * 1024;

// A name: nine characters of the commit's moment, six of a count. The count
// starts at a chance place in each commit and only ever goes up, so a commit's
// new holons are its first name and how many, and their names sort as they sit.
const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const encode = (n: number, width: number) => { let s = ""; for (let i = 0; i < width; i++) { s = alphabet[n % 32] + s; n = Math.floor(n / 32); } return s; };
const decode = (s: string) => [...s].reduce((n, c) => n * 32 + alphabet.indexOf(c), 0);
export const nameAt = (ms: number, count = 0) => encode(ms, 9) + encode(count, 6);
export const nextName = (name: string) => name.slice(0, 9) + encode(decode(name.slice(9)) + 1, 6);
const moment = (name: string) => name.slice(0, 9);

const logPath = (dir: string, volume: number) => join(dir, "log", `${volume}.jsonl`);
const linesOf = (dir: string, volume: number) => readFileSync(logPath(dir, volume), "utf8").split("\n").filter(Boolean);
const refOf = (dir: string): [string, number] | null => { const p = join(dir, "refs/main"); if (!existsSync(p)) return null; const [h, v] = readFileSync(p, "utf8").trim().split(" "); return [h!, Number(v)]; };

function stateOf(c: Checkpoint): State { return { table: [...c.blocks], moved: new Map(c.moved), gone: new Set(c.gone) }; }
function apply(s: State, l: Line) {
  for (const b of l.blocks) {
    if (b.first) s.table.push([b.hash, b.first]);
    for (const m of b.moved) { s.moved.set(m, b.hash); s.gone.delete(m); }
  }
  for (const g of l.gone) s.gone.add(g);
}
const sorted = (s: State) => { s.table.sort((a, b) => (a[1] < b[1] ? -1 : 1)); return s; };

// Reading: the ref, the open volume, the chain between them checked. A block is
// fetched whole, once, and checked against its hash before it is parsed.
export async function open(dir: string) {
  const ref = refOf(dir);
  const raw = ref ? linesOf(dir, ref[1]) : [];
  let parent: string | null = null;
  let state: State = { table: [], moved: new Map(), gone: new Set() };
  raw.forEach((text, i) => {
    const l: Line = JSON.parse(text);
    if (i && l.parent !== parent) throw new Error(`log volume ${ref![1]} breaks at line ${i}`);
    if (i === 0) { if (!l.checkpoint) throw new Error(`log volume ${ref![1]} opens with no checkpoint`); state = stateOf(l.checkpoint); }
    else apply(state, l);
    parent = sha(text);
  });
  if (ref && parent !== ref[0]) throw new Error("the ref names no line of its volume");
  sorted(state);

  const cache = new Map<string, Map<string, any>>();
  function block(hash: string) {
    const held = cache.get(hash);
    if (held) return held;
    const bytes = readFileSync(join(dir, "blocks", `${hash}.jsonl`));
    if (sha(bytes) !== hash) throw new Error(`block ${hash} does not match its bytes`);
    const m = new Map<string, any>();
    for (const l of bytes.toString("utf8").split("\n")) if (l) { const o = JSON.parse(l); if (m.has(o.id)) throw new Error(`block ${hash} holds ${o.id} twice`); m.set(o.id, o); }
    cache.set(hash, m);
    return m;
  }
  const floor = (s: State, id: string) => { let lo = 0, hi = s.table.length - 1, at: [string, string] | null = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (s.table[m]![1] <= id) { at = s.table[m]!; lo = m + 1; } else hi = m - 1; } return at; };
  // The block holding a holon's latest version, in a given state.
  const place = (s: State, id: string) => { const h = s.moved.get(id) ?? floor(s, id)?.[0]; return h && block(h).has(id) ? h : null; };
  const latest = (id: string) => place(state, id);
  const toHolon = (l: any): Holon => { const { prev, ...rest } = l; return rest; };
  function enumerate(s: State) {
    const out = new Map<string, { version: string; holon: Holon }>();
    for (const h of new Set([...s.table.map((t) => t[0]), ...s.moved.values()]))
      for (const [id, l] of block(h)) if (!s.gone.has(id) && place(s, id) === h) out.set(id, { version: h, holon: toHolon(l) });
    return new Map([...out].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  }
  // Every holon the head holds: its id, the block of its version, and the holon.
  const holons = async () => enumerate(state);
  // One holon, if the head still holds it.
  const get = async (id: string): Promise<Holon | null> => { const h = latest(id); return h && !state.gone.has(id) ? toHolon(block(h).get(id)) : null; };
  // Every version of one holon, newest first, following prev. Fetched only when asked.
  const versions = async (id: string) => { const out: any[] = []; for (let h: string | null = latest(id); h; ) { const l: any = block(h).get(id); out.push(l); h = l.prev; } return out; };
  // The whole log, oldest first, the chain checked back from the ref. Only when asked.
  async function history() {
    const out: { text: string; hash: string; line: Line }[] = [];
    if (!ref) return out;
    let up: string | null = null;
    for (let v = 0; v <= ref[1]; v++) for (const text of linesOf(dir, v)) { const line: Line = JSON.parse(text); if (line.parent !== up) throw new Error(`the log breaks at volume ${v}`); up = sha(text); out.push({ text, hash: up, line }); }
    if (up !== ref[0]) throw new Error("the ref is not the log's last line");
    return out;
  }
  // The field as it stood after one commit of the log, by its place in history().
  async function fieldAt(index: number) {
    const log = await history();
    const conversion = log.find((x) => x.line.conversion)?.line.conversion;
    if (log[index]!.line.held) {
      const held = new Map<string, string>();
      for (const { line } of log.slice(0, index + 1)) { for (const [id, ord] of line.held!) held.set(id, conversion!.blocks[ord]!); for (const g of line.gone) held.delete(g); }
      return new Map([...held].map(([id, h]) => [id, { version: h, holon: toHolon(block(h).get(id)) }]));
    }
    let start = index; while (!log[start]!.line.checkpoint) start--;
    const s = stateOf(log[start]!.line.checkpoint!);
    for (const { line } of log.slice(start + 1, index + 1)) apply(s, line);
    return enumerate(sorted(s));
  }
  // The next free name of this commit.
  let next: string | null = null;
  const mint = () => { const n = next ?? nameAt(Date.now(), randomInt(32768) * 32768); next = nextName(n); return n; };
  return { dir, head: ref?.[0] ?? null, volume: ref?.[1] ?? 0, state, block, latest, floor, get, holons, versions, history, fieldAt, mint };
}

// Writes one log line and then the ref. A line opens a new volume, with the whole
// table, when the open one has grown past a block's size.
function append(dir: string, store: Store, l: Pick<Line, "at" | "blocks" | "gone" | "says">) {
  mkdirSync(join(dir, "log"), { recursive: true });
  mkdirSync(join(dir, "refs"), { recursive: true });
  const open = store.head ? linesOf(dir, store.volume) : [];
  const grown = open.slice(1).reduce((n, t) => n + Buffer.byteLength(t) + 1, 0);
  const fresh = !store.head || grown >= blockSize;
  const volume = !store.head ? 0 : fresh ? store.volume + 1 : store.volume;
  const line: Line = { ...l, parent: store.head };
  if (fresh) {
    const s: State = { table: [...store.state.table], moved: new Map(store.state.moved), gone: new Set(store.state.gone) };
    apply(s, line);
    line.checkpoint = { blocks: sorted(s).table, gone: [...s.gone].sort(), moved: [...s.moved].sort((a, b) => (a[0] < b[0] ? -1 : 1)) };
  }
  const text = canonical(line);
  appendFileSync(logPath(dir, volume), text + "\n");
  const head = sha(text);
  writeFileSync(join(dir, "refs/main"), `${head} ${volume}\n`);
  return head;
}

// Adds one commit: the holons given, new or edited, each a new version pointing
// back at the block before. New holons take names from store.mint(), in order.
export async function commit(store: Store, holons: Holon[], says: string, at = new Date().toISOString(), gone: string[] = []) {
  if (refOf(store.dir)?.[0] !== (store.head ?? undefined)) throw new Error("the store moved since it was opened");
  const fresh: Holon[] = [], edited: [Holon, string][] = [];
  for (const h of holons) { const was = store.latest(h.id); if (was) edited.push([h, was]); else fresh.push(h); }
  fresh.sort((a, b) => (a.id < b.id ? -1 : 1));
  fresh.forEach((h, i) => { if (i && h.id !== nextName(fresh[i - 1]!.id)) throw new Error(`new names are not one run: ${fresh[i - 1]!.id} then ${h.id}`); });
  if (fresh.length) { const f = store.floor(store.state, fresh[0]!.id); if (f && moment(f[1]) === moment(fresh[0]!.id)) throw new Error(`another commit holds the moment of ${fresh[0]!.id}: mint again`); }
  const line = (h: Holon, prev: string | null) => canonical({ ...h, prev });
  const blocks: BlockEntry[] = [];
  let bytes = 0, cur: string[] = [], size = 0, first: string | null = null, count = 0, moved: string[] = [];
  const flush = () => {
    if (!cur.length) return;
    const text = cur.join("\n") + "\n", hash = sha(text);
    mkdirSync(join(store.dir, "blocks"), { recursive: true });
    writeFileSync(join(store.dir, "blocks", `${hash}.jsonl`), text);
    blocks.push({ first, hash, moved, new: count });
    bytes += Buffer.byteLength(text); cur = []; size = 0; first = null; count = 0; moved = [];
  };
  const add = (t: string) => { const n = Buffer.byteLength(t) + 1; if (cur.length && size + n > blockSize) flush(); cur.push(t); size += n; };
  for (const h of fresh) { add(line(h, null)); first ??= h.id; count++; }
  for (const [h, was] of edited) { add(line(h, was)); moved.push(h.id); }
  flush();
  const out = gone.filter((id) => store.latest(id) && !store.state.gone.has(id)).sort();
  const head = append(store.dir, store, { at, blocks, gone: out, says });
  return { commit: head, blocks: blocks.length, bytes, holons: holons.length };
}

// Lands another copy's commits on this store: its blocks are copied as they are,
// and its log lines chained on again. Nothing in a block changes, so no name or
// reference does. Two copies that changed one holon stop here and ask.
export async function land(store: Store, otherDir: string) {
  const other = await open(otherDir);
  const ours = await store.history(), theirs = await other.history();
  let common = 0; while (common < ours.length && common < theirs.length && ours[common]!.hash === theirs[common]!.hash) common++;
  if (common === 0 && ours.length && theirs.length) throw new Error("these copies share no history");
  const touched = new Set<string>();
  for (const { line } of ours.slice(common)) { for (const b of line.blocks) b.moved.forEach((m) => touched.add(m)); line.gone.forEach((g) => touched.add(g)); }
  const incoming = theirs.slice(common);
  for (const { line } of incoming) for (const id of [...line.blocks.flatMap((b) => b.moved), ...line.gone]) if (touched.has(id)) throw new Error(`both copies changed ${id}`);
  const moments = new Set(ours.slice(common).flatMap(({ line }) => line.blocks.flatMap((b) => (b.first ? [moment(b.first)] : []))));
  for (const { line } of incoming) for (const b of line.blocks) if (b.first && moments.has(moment(b.first))) throw new Error(`both copies minted in the moment of ${b.first}`);
  let at = store;
  for (const { line } of incoming) {
    mkdirSync(join(store.dir, "blocks"), { recursive: true });
    for (const b of line.blocks) copyFileSync(join(otherDir, "blocks", `${b.hash}.jsonl`), join(store.dir, "blocks", `${b.hash}.jsonl`));
    append(store.dir, at, { at: line.at, blocks: line.blocks, gone: line.gone, says: line.says });
    at = await open(store.dir);
  }
  return { landed: incoming.length, head: at.head };
}

// The field: every store under store/ read as one.
export async function field() {
  const all = new Map<string, Holon>();
  const dirs = [storeDir, ...[...new Bun.Glob("*/refs/main").scanSync(storeDir)].map((f) => join(storeDir, f.split("/")[0]!))];
  for (const dir of dirs) {
    if (!(await Bun.file(join(dir, "refs/main")).exists())) continue;
    for (const [id, { holon }] of await (await open(dir)).holons()) all.set(id, holon);
  }
  return all;
}
