// A store is where holons are kept and how they travel: plain files, read from
// a ref, that any static host can serve. vectors/README.md is the format in full.
//
//   refs/main           "<hash of the last log line> <open volume>"; written last
//   log/<n>.jsonl       commits, one per line; each volume opens with a checkpoint
//   blocks/<hash>.jsonl versions, one per line, about 64 KB to a block
//
// An act is one commit in every store it touches: each store's line holds the act
// whole, its predecessor, and, where the act wrote elsewhere too, which blocks are its
// own and every store it touched. What the act says, apart from where it stands, is the
// same in every store.
//
// Writing is made safe three ways. Nothing is overwritten in place: the ref and a volume
// written again are replaced whole. A store is locked for the length of an act. And an
// act cut short among its refs is seen, by its line past a store's ref, so it is finished
// or never written over; which, only the engine can know, seeing every store.
//
// A store here is a value: what stood at one head. Adding to it gives the next.
// Reading the latest of any holon costs the ref, the open volume and one block.
// Everything older is fetched only when asked for.

import { canonical } from "./canonical.ts";
import { encoded, sha, type Files } from "./files.ts";

export type Holon = {
  id: string;
  instance: string[];
  name?: string;
  mould?: Record<string, unknown>;
  body: Record<string, any>;
};

// A holon as it stood: prev is the hash of the block holding the version before.
export type Version = Holon & { prev: string | null };

// A version as the holon it is, without where its history leads.
export const asHolon = ({ prev: _, ...holon }: Version): Holon => holon;

export type Latest = { block: string; version: Version };

export type BlockEntry = { first: string | null; hash: string; moved: string[]; new: number };

type Checkpoint = {
  blocks: TableBlock[];
  gone: Gone;
  moved: [id: string, hash: string][];
};

// A line names the line before it as its predecessor; one written before 2026-11-11
// names it its parent. Own and stores are said only by an act that touched other stores
// too: stores names each store it touched, as the engine writing it knew them, so an act
// cut short can be finished; a line written before 2026-11-12 names none.
type Line = {
  at: string;
  blocks: BlockEntry[];
  gone: Gone;
  predecessor?: string | null;
  parent?: string | null;
  own?: string[];
  stores?: string[];
  says: string;
  checkpoint?: Checkpoint;
  conversion?: { blocks: string[] };
  held?: [id: string, place: number][];
  oldHash?: string;
};

// What a line or a checkpoint takes out: ids, and runs of ids that follow one another,
// a first and how many, as a whole taken away lies; a lone id is said as itself.
type Gone = (string | [first: string, count: number])[];

// The most ids one run of gone may name: far past any whole yet taken away, and short
// of what a reader could not hold.
const longestRun = 2 ** 20;

// Every id gone names. A run is of two or more, within the six characters of a count.
export function goneIds(gone: Gone = []) {
  return gone.flatMap((each) => {
    if (typeof each === "string") return [each];

    const [first, count] = each;
    if (
      !Number.isInteger(count) ||
      count < 2 ||
      count > longestRun ||
      decode(first.slice(9)) + count > 32 ** 6
    )
      throw new Error(`a run of gone ids is not one: ${first} and ${count}`);

    const ids = [first];
    while (ids.length < count) ids.push(nextId(ids.at(-1)!));

    return ids;
  });
}

// Ids said as gone: in order, each run of two or more as its first and how many.
export function goneOf(ids: Iterable<string>): Gone {
  const said: Gone = [];
  let last: string | undefined;

  for (const id of [...new Set(ids)].sort()) {
    const run = said.at(-1);

    if (last !== undefined && nextId(last) === id) {
      said[said.length - 1] = typeof run === "string" ? [run, 2] : [run![0], run![1] + 1];
    } else {
      said.push(id);
    }

    last = id;
  }

  return said;
}

// A block in the table: its hash, its first new holon, and how many new ones it holds
// from there; a block entered before 2026-11-11 has no count.
type TableBlock = [hash: string, first: string, count?: number];

// What a head holds: which block holds what. Never changed, only made anew.
type Table = {
  blocks: TableBlock[];
  moved: Map<string, string>;
  gone: Set<string>;
};

// A commit as a store's log tells it: its hash, the hash of the act it is, when, what it
// says, and the blocks it wrote here and what it took out.
export type LogEntry = {
  hash: string;
  act: string;
  at: string;
  says: string;
  blocks: BlockEntry[];
  gone: string[];
};

export type Commit = {
  holons: Holon[];
  says: string;
  at?: string;
  gone?: string[];
};

const blockSize = 64 * 1024;

export { sha };

// ---- Ids

// An id is nine characters of a commit's moment and six of a count. The count starts
// at a chance place in each commit and only goes up, so a commit's new holons are its
// first id and how many, and their ids sort as they sit. A holon's name is another
// thing: what it is called, beside its id.

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encode(n: number, width: number) {
  let text = "";

  for (let i = 0; i < width; i++) {
    text = alphabet[n % 32] + text;
    n = Math.floor(n / 32);
  }

  return text;
}

const decode = (text: string) => [...text].reduce((n, char) => n * 32 + alphabet.indexOf(char), 0);

export const idAt = (ms: number, count = 0) => encode(ms, 9) + encode(count, 6);

export const nextId = (id: string) => id.slice(0, 9) + encode(decode(id.slice(9)) + 1, 6);

// The holons a commit gave a version: each block's new ones, a run from its first, and
// those it moved there. Read from the line alone, no block fetched.
export function writtenBy({ blocks }: Pick<LogEntry, "blocks">) {
  return blocks.flatMap(({ first, new: count, moved }) => {
    const born: string[] = [];
    for (let id = first; id && born.length < count; id = nextId(id)) born.push(id);

    return [...born, ...moved];
  });
}

// An id derived from what an integration reads, not minted: the top bit set, which no
// moment glass mints reaches before the year 2527, two bits saying what of the source it
// names, then the first 72 bits of the source's own hash. The same thing read anywhere is
// the same id, and the id leads back to it.
export function derivedId(facet: number, hex: string) {
  let n = (1n << 74n) | (BigInt(facet & 3) << 72n) | BigInt(`0x${hex.slice(0, 18).padEnd(18, "0")}`);
  let text = "";

  for (let i = 0; i < 15; i++) {
    text = alphabet[Number(n % 32n)] + text;
    n /= 32n;
  }

  return text;
}

const valueOf = (id: string) => [...id].reduce((n, char) => n * 32n + BigInt(alphabet.indexOf(char)), 0n);

export const isDerived = (id: string) => isId(id) && valueOf(id) >> 74n === 1n;

// What a derived id names: its facet and the hash's first eighteen characters.
export function derivedOf(id: string) {
  if (!isDerived(id)) return null;

  const n = valueOf(id);
  return { facet: Number((n >> 72n) & 3n), prefix: (n & ((1n << 72n) - 1n)).toString(16).padStart(18, "0") };
}

export const isId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9A-HJKMNP-TV-Z]{15}$/.test(value);

const momentOf = (id: string) => id.slice(0, 9);

const chanceStart = () => (crypto.getRandomValues(new Uint32Array(1))[0]! % 32768) * 32768;

// ---- The table

const emptyTable = (): Table => ({ blocks: [], moved: new Map(), gone: new Set() });

const tableOf = ({
  blocks,
  moved,
  gone,
}: {
  blocks: Table["blocks"];
  moved: Iterable<[string, string]>;
  gone: Iterable<Gone[number]>;
}): Table => ({
  blocks: [...blocks],
  moved: new Map(moved),
  gone: new Set(goneIds([...gone])),
});

// The line before, as a line names it.
function predecessorOf(line: Line) {
  if ("predecessor" in line && "parent" in line)
    throw new Error("a line names both a predecessor and a parent");

  return line.predecessor ?? line.parent ?? null;
}

// The blocks of a line this store keeps: all of them, unless it says which are its own.
const ownBlocks = ({ blocks, own }: Pick<Line, "blocks" | "own">) =>
  own ? blocks.filter(({ hash }) => own.includes(hash)) : blocks;

function apply(table: Table, line: Pick<Line, "blocks" | "gone" | "own">) {
  for (const block of ownBlocks(line)) {
    if (block.first) table.blocks.push([block.hash, block.first, block.new]);

    for (const id of block.moved) {
      table.moved.set(id, block.hash);
      table.gone.delete(id);
    }
  }

  sortBlocks(table);
  for (const id of goneIds(line.gone)) if (mayHold(table, id)) table.gone.add(id);
}

const byId =
  <T>(idOf: (item: T) => string) =>
  (a: T, b: T) =>
    idOf(a) < idOf(b) ? -1 : 1;

const sortBlocks = (table: Table) => {
  table.blocks.sort(byId(([, first]) => first));
  return table;
};

// The block whose first id is the greatest at or below this one.
function floor(table: Table, id: string) {
  let low = 0;
  let high = table.blocks.length - 1;
  let found: TableBlock | undefined;

  while (low <= high) {
    const middle = (low + high) >> 1;

    if (table.blocks[middle]![1] <= id) {
      found = table.blocks[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return found;
}

// Whether a commit here already minted in an id's moment.
function holdsMoment(table: Table, id: string) {
  const block = floor(table, id);
  return block !== undefined && momentOf(block[1]) === momentOf(id);
}

// Whether this head can hold an id at all, known without fetching anything: it was
// moved into a block here, or it lies in a run of new holons a block here holds. A
// block without a count is known only by the moment it was minted in.
function mayHold(table: Table, id: string) {
  if (table.moved.has(id)) return true;
  if (!holdsMoment(table, id)) return false;

  const [, first, count] = floor(table, id)!;
  return count === undefined || decode(id.slice(9)) < decode(first.slice(9)) + count;
}

// ---- Reading

const logPath = (volume: number) => `log/${volume}.jsonl`;
const blockPath = (hash: string) => `blocks/${hash}.jsonl`;

const textOf = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const linesOf = (text: string) => text.split("\n").filter(Boolean);

async function readLines(files: Files, volume: number) {
  const bytes = await files.read(logPath(volume));
  if (!bytes) throw new Error(`log volume ${volume} is missing`);

  return linesOf(textOf(bytes));
}

async function readRef(files: Files) {
  const bytes = await files.read("refs/main");
  if (!bytes) return null;

  const [head, volume] = textOf(bytes).trim().split(" ");
  return { head: head!, volume: Number(volume) };
}

// The table a volume gives: its checkpoint, and each line after it, the chain between
// them and the ref checked. Nothing older is needed. The ref moves last, so a line past
// it is a commit that never finished, and was never part of this store.
async function tableFromVolume(lines: string[], head: string) {
  let table = emptyTable();
  let before: string | null = null;

  for (const [i, text] of lines.entries()) {
    const line: Line = JSON.parse(text);

    const named = predecessorOf(line);
    if (i > 0 && named !== before) throw new Error(`the log breaks at line ${i} of its open volume`);

    if (i === 0) {
      if (!line.checkpoint) throw new Error("the open log volume has no checkpoint");
      table = tableOf(line.checkpoint);
    } else {
      apply(table, line);
    }

    before = await sha(text);

    if (before === head) return { table: sortBlocks(table), length: i + 1 };
  }

  throw new Error("the ref names no line of its volume");
}

export type Store = Awaited<ReturnType<typeof openStore>>;

export async function openStore(files: Files, blocks = new Map<string, Promise<Map<string, Version>>>()) {
  const ref = await readRef(files);
  const lines = ref ? await readLines(files, ref.volume) : [];
  const opened = ref ? await tableFromVolume(lines, ref.head) : { table: emptyTable(), length: 0 };
  const { table, length: openLines } = opened;
  const head = ref?.head ?? null;

  // A block is fetched whole, once, and checked against its hash before it is read.
  function block(hash: string) {
    let held = blocks.get(hash);

    if (!held) {
      held = fetchBlock(hash);
      blocks.set(hash, held);
      held.catch(() => blocks.delete(hash));
    }

    return held;
  }

  async function fetchBlock(hash: string) {
    const bytes = await files.read(blockPath(hash));
    if (!bytes) throw new Error(`block ${hash} is missing`);
    if ((await sha(bytes)) !== hash) throw new Error(`block ${hash} does not match its bytes`);

    const versions = new Map<string, Version>();

    for (const text of linesOf(textOf(bytes))) {
      const version: Version = JSON.parse(text);

      if (versions.has(version.id)) throw new Error(`block ${hash} holds ${version.id} twice`);
      versions.set(version.id, version);
    }

    return versions;
  }

  const blockOf = (state: Table, id: string) => state.moved.get(id) ?? floor(state, id)?.[0];

  async function latestIn(state: Table, id: string): Promise<Latest | null> {
    const hash = blockOf(state, id);
    if (!hash) return null;

    const version = (await block(hash)).get(id);
    return version ? { block: hash, version } : null;
  }

  // The latest of a holon this head holds. One taken out reads as nothing, though
  // lastVersion still finds it.
  async function read(id: string) {
    if (table.gone.has(id) || !mayHold(table, id)) return null;

    return latestIn(table, id);
  }

  async function allIn(state: Table) {
    const hashes = new Set([...state.blocks.map(([hash]) => hash), ...state.moved.values()]);
    const out = new Map<string, Latest>();

    await Promise.all(
      [...hashes].map(async (hash) => {
        for (const [id, version] of await block(hash)) {
          if (!state.gone.has(id) && blockOf(state, id) === hash) out.set(id, { block: hash, version });
        }
      }),
    );

    return new Map([...out].sort(byId(([id]) => id)));
  }

  // Every holon this head holds. It fetches every block, so only a question
  // about everything should ask it.
  const all = () => allIn(table);

  // The whole log, oldest first, its chain checked up to the ref. Only when asked.
  async function fullLog() {
    const entries: { text: string; hash: string; line: Line }[] = [];
    if (!ref) return entries;

    let before: string | null = null;

    for (let volume = 0; volume <= ref.volume; volume++) {
      for (const text of await readLines(files, volume)) {
        const line: Line = JSON.parse(text);

        if (predecessorOf(line) !== before) throw new Error(`the log breaks in volume ${volume}`);

        before = await sha(text);
        entries.push({ text, hash: before, line });

        if (before === ref.head) return entries;
      }
    }

    throw new Error("the ref is not a line of the log");
  }

  const log = async (): Promise<LogEntry[]> =>
    Promise.all(
      (await fullLog()).map(async ({ hash, line }) => ({
        hash,
        act: await actHash(line),
        at: line.at,
        says: line.says,
        blocks: ownBlocks(line),
        gone: goneIds(line.gone),
      })),
    );

  // Every version of a holon, newest first, following prev. Only when asked.
  async function versions(id: string) {
    const latest = await latestIn(table, id);
    const out: Version[] = [];

    for (let at = latest?.version ?? null; at; ) {
      out.push(at);
      at = at.prev ? ((await block(at.prev)).get(id) ?? null) : null;
    }

    return out;
  }

  // The field as an old commit left it: what each commit since the first held anew,
  // named by a block's place in the conversion line.
  async function allBeforeConversion(entries: { line: Line }[], index: number) {
    const placed = entries.find(({ line }) => line.conversion)!.line.conversion!.blocks;
    const held = new Map<string, string>();

    for (const { line } of entries.slice(0, index + 1)) {
      for (const [id, place] of line.held!) held.set(id, placed[place]!);
      for (const id of goneIds(line.gone)) held.delete(id);
    }

    const out = new Map<string, Latest>();

    for (const [id, hash] of held) out.set(id, { block: hash, version: (await block(hash)).get(id)! });

    return out;
  }

  // The field as it stood after one commit, by its place in the log. Only when asked.
  async function allAt(index: number) {
    const entries = await fullLog();
    const at = entries[index];

    if (!at) throw new Error(`the log has no commit ${index}`);
    if (at.line.held) return allBeforeConversion(entries, index);

    let start = index;
    while (!entries[start]!.line.checkpoint) start--;

    const state = tableOf(entries[start]!.line.checkpoint!);
    for (const { line } of entries.slice(start + 1, index + 1)) apply(state, line);

    return allIn(sortBlocks(state));
  }

  // The ids of one commit, in order. Everything given one belongs in that commit.
  // A commit's moment is after every one this head holds, so two commits made within
  // one tick of the clock are still apart.
  function minter() {
    const latest = table.blocks.reduce(
      (greatest, [, first]) => Math.max(greatest, decode(momentOf(first))),
      0,
    );
    let next = idAt(Math.max(Date.now(), latest + 1), chanceStart());

    return () => {
      const id = next;
      next = nextId(id);
      return id;
    };
  }

  // The act a line past the ref was written for, if one waits there: see pendingOf. The
  // volume is read again, for a line past the ref may be written after this head was read.
  const pending = async () =>
    pendingOf(await lineAfter(files, ref, ref ? await readLines(files, ref.volume) : [], openLines), head);

  // Where this store stands toward an act: at it, its head; written past its ref, and
  // waiting; earlier in its log, read whole only to know; or nowhere in it.
  async function toward(act: string): Promise<"head" | "pending" | "earlier" | "nowhere"> {
    if (openLines && (await actHash(JSON.parse(lines[openLines - 1]!))) === act) return "head";
    if ((await pending())?.act === act) return "pending";
    if ((await log()).some((entry) => entry.act === act)) return "earlier";
    return "nowhere";
  }

  return {
    files,
    blocks,
    head,
    volume: ref?.volume ?? 0,
    openLines,
    table,
    mayHold: (id: string) => mayHold(table, id),
    read,
    lastVersion: (id: string) => latestIn(table, id),
    all,
    log,
    fullLog,
    versions,
    allAt,
    minter,
    pending,
    toward,
  };
}

// ---- What lies past the ref

// The first line past a store's ref: past the open volume's last line, or opening the
// next volume, or, in a store never written, the first of all.
async function lineAfter(
  files: Files,
  ref: { volume: number } | null,
  lines: readonly string[],
  openLines: number,
) {
  if (ref && lines.length > openLines) return { text: lines[openLines]!, volume: ref.volume };

  const volume = ref ? ref.volume + 1 : 0;
  const bytes = await files.read(logPath(volume));
  const [text] = bytes ? linesOf(textOf(bytes)) : [];

  return text === undefined ? null : { text, volume };
}

// An act that waits past a store's ref: a whole line following its head, written for an
// act across several stores whose ref here never moved. It may have moved elsewhere, so
// the line is never written over until the engine, seeing every store it names, finishes
// it or knows it moved nowhere. Anything else past the ref, a line cut short or one of
// an act of this store alone, never happened, and is written over.
export type Pending = { act: string; says: string; stores: string[]; line: string; volume: number };

async function pendingOf(after: { text: string; volume: number } | null, head: string | null) {
  if (!after) return null;

  let line: Line;
  try {
    line = JSON.parse(after.text);
  } catch {
    return null;
  }

  if (predecessorOf(line) !== head || !Array.isArray(line.stores) || line.stores.length < 2) return null;

  return {
    act: await actHash(line),
    says: line.says,
    stores: line.stores,
    line: after.text,
    volume: after.volume,
  };
}

const waits = ({ act, says, stores }: Pending) =>
  new Error(`the act ${act} ("${says}") was cut short here: it waits on ${stores.join(", ")}`);

// ---- Writing

// A store is a value, so one opened before another commit landed is out of date, and
// writing from it would lose that commit.
async function mustBeCurrent(store: Store) {
  const ref = await readRef(store.files);

  if ((ref?.head ?? null) !== store.head) throw new Error("the store moved since it was opened");
}

// Writes a store's line, past its ref, and gives what publishes it: the ref moved to
// it, and the store it made. What a commit that never finished left past the ref is
// written over, the volume replaced whole, unless it is an act that waits.
async function writeLine(
  store: Store,
  fields: Pick<Line, "at" | "blocks" | "gone" | "says" | "own" | "stores">,
) {
  const open = store.head ? await readLines(store.files, store.volume) : [];
  const kept = open.slice(0, store.openLines);
  const waiting = await pendingOf(
    await lineAfter(store.files, store.head ? store : null, open, store.openLines),
    store.head,
  );
  if (waiting) throw waits(waiting);

  const grown = kept.slice(1).reduce((size, text) => size + encoded(text).length + 1, 0);
  const opensVolume = !store.head || grown >= blockSize;
  const volume = !store.head ? 0 : opensVolume ? store.volume + 1 : store.volume;
  const line: Line = { ...fields, predecessor: store.head };

  if (opensVolume) {
    const state = tableOf(store.table);
    apply(state, line);

    line.checkpoint = {
      blocks: sortBlocks(state).blocks,
      gone: goneOf(state.gone),
      moved: [...state.moved].sort(byId(([id]) => id)),
    };
  }

  const text = canonical(line);
  const asText = (lines: string[]) => lines.map((one) => `${one}\n`).join("");

  if (open.length > kept.length)
    await store.files.replace(logPath(store.volume), asText(opensVolume ? kept : [...kept, text]));

  if (opensVolume) await store.files.replace(logPath(volume), asText([text]));
  else if (open.length === kept.length) await store.files.append(logPath(volume), asText([text]));

  return () => moveRef(store, text, volume);
}

async function moveRef(store: Store, line: string, volume: number) {
  await store.files.replace("refs/main", `${await sha(line)} ${volume}\n`);
  return openStore(store.files, store.blocks);
}

// Cuts what a commit writes into blocks, none past the block size unless one line is.
function cut<T extends { text: string }>(lines: T[]) {
  const pieces: T[][] = [];
  let piece: T[] = [];
  let size = 0;

  for (const line of lines) {
    const length = encoded(line.text).length + 1;

    if (piece.length && size + length > blockSize) {
      pieces.push(piece);
      piece = [];
      size = 0;
    }

    piece.push(line);
    size += length;
  }

  if (piece.length) pieces.push(piece);
  return pieces;
}

// A store's share of an act: the holons it keeps, and the ids it takes out. An act
// across several stores names each, as the writer knows it.
export type Given = { store: Store; name?: string; holons: Holon[]; gone?: string[] };

// What an act says, and its new holons, born: those the act minted.
export type Act = { says: string; at?: string; born: readonly string[] };

// Writes one store's share of an act into its blocks: in this store, the act's new
// holons it keeps, as far as they run one after another, are its own run; whatever else
// it keeps arrives, moved, pointing back at the block before here, if any.
type Place = { holon: Holon; was: Latest | null };

async function writeBlocks(store: Store, places: Place[], minted: ReadonlySet<string>) {
  const mine = places
    .filter(({ holon, was }) => !was && minted.has(holon.id))
    .map(({ holon }) => holon)
    .sort(byId(({ id }) => id));
  const run: Holon[] = [];
  for (const holon of mine) {
    if (run.length && holon.id !== nextId(run.at(-1)!.id)) break;
    run.push(holon);
  }

  const inRun = new Set(run.map(({ id }) => id));

  const lines = [
    ...run.map((holon) => ({ id: holon.id, isNew: true, text: canonical({ ...holon, prev: null }) })),
    ...places
      .filter(({ holon }) => !inRun.has(holon.id))
      .map(({ holon, was }) => ({
        id: holon.id,
        isNew: false,
        text: canonical({ ...holon, prev: was?.block ?? null }),
      })),
  ];

  const entries: BlockEntry[] = [];
  let bytes = 0;

  for (const piece of cut(lines)) {
    const text = `${piece.map((line) => line.text).join("\n")}\n`;
    const hash = await sha(text);

    await store.files.write(blockPath(hash), text);
    bytes += encoded(text).length;

    const isNew = piece.filter((line) => line.isNew);

    entries.push({
      first: isNew[0]?.id ?? null,
      hash,
      moved: piece.filter((line) => !line.isNew).map(({ id }) => id),
      new: isNew.length,
    });
  }

  return { entries, bytes };
}

// One act, one commit in every store it touches, given each store and the holons it
// keeps. Its new holons, born, are one run, minted together in a moment no store has
// used. Each store is locked, in the order of their names, for the length of the act.
// Every block is written to every store, then each store's line, then each ref, so an
// act cut short after its blocks published nothing, and one cut short among its refs
// waits past the refs not moved. What each store is given to take out goes from it.
export async function act(given: Given[], saying: Act) {
  if (new Set(given.map(({ store }) => store.files)).size !== given.length)
    throw new Error("one store is given twice in one act");
  if (given.length > 1 && !given.every(({ name }) => name))
    throw new Error("an act given several stores names each");

  return locked(
    [...given].sort(byId(({ name }) => name ?? "")).map(({ store }) => store),
    () => writeAct(given, saying),
  );
}

// What a task does with stores locked, in the order given, each let go after.
async function locked<T>(stores: readonly Store[], task: () => Promise<T>) {
  const locks: (() => Promise<void>)[] = [];

  try {
    for (const store of stores) locks.push(await store.files.lock());
    return await task();
  } finally {
    for (const letGo of locks.reverse()) await letGo();
  }
}

async function writeAct(given: Given[], { says, at = new Date().toISOString(), born }: Act) {
  for (const { store, holons } of given) {
    await mustBeCurrent(store);

    if (new Set(holons.map(({ id }) => id)).size !== holons.length)
      throw new Error("one holon is written twice in one store");
  }

  // Where each holon stood in each store given: its version there, if any.
  const placed = await Promise.all(
    given.map(({ store, holons }) =>
      Promise.all(holons.map(async (holon) => ({ holon, was: await store.lastVersion(holon.id) }))),
    ),
  );
  const minted = [...new Set(born)].sort();

  minted.forEach((id, i) => {
    if (i > 0 && id !== nextId(minted[i - 1]!))
      throw new Error(`new ids are not one run: ${minted[i - 1]} then ${id}`);
  });

  if (minted.length && given.some(({ store }) => holdsMoment(store.table, minted[0]!)))
    throw new Error(`another commit holds the moment of ${minted[0]}: mint again`);

  const mintedSet = new Set(minted);
  const written: Awaited<ReturnType<typeof writeBlocks>>[] = [];
  for (const [i, { store }] of given.entries()) written.push(await writeBlocks(store, placed[i]!, mintedSet));

  const holding = given.map(({ gone = [] }) => gone);
  const taken = [...new Set(holding.flat())].sort();

  const touched = given.map(
    (_, i) => given.length === 1 || written[i]!.entries.length > 0 || holding[i]!.length > 0,
  );
  if (!touched.some(Boolean))
    throw new Error("the act touches no store: it writes nothing and takes nothing out");

  const several = touched.filter(Boolean).length > 1;
  const names = several
    ? {
        stores: given
          .filter((_, i) => touched[i])
          .map(({ name }) => name!)
          .sort(),
      }
    : {};

  const blocks = [
    ...new Map(written.flatMap(({ entries }) => entries).map((entry) => [canonical(entry), entry])).values(),
  ].sort(byId(({ hash }) => hash));
  const content = { at, blocks, gone: goneOf(taken), says };

  const publish = [];
  for (const [i, { store }] of given.entries()) {
    if (!touched[i]) continue;

    const own = several ? { own: written[i]!.entries.map(({ hash }) => hash).sort() } : {};
    publish.push({ i, moveRef: await writeLine(store, { ...content, ...own, ...names }) });
  }

  const stores = given.map(({ store }) => store);
  for (const { i, moveRef } of publish) stores[i] = await moveRef();

  return {
    stores,
    act: await sha(sayingOf(content)),
    blocks: written.reduce((sum, { entries }) => sum + entries.length, 0),
    bytes: written.reduce((sum, { bytes }) => sum + bytes, 0),
  };
}

// Adds one commit to one store and gives the store it made: an act that touches it alone,
// whose new holons are those the store keeps no version of.
export async function commit(store: Store, change: Commit) {
  const was = await Promise.all(change.holons.map(({ id }) => store.lastVersion(id)));
  const born = change.holons.filter((_, i) => !was[i]).map(({ id }) => id);
  const done = await act([{ store, holons: change.holons, gone: change.gone }], { ...change, born });
  const next = done.stores[0]!;

  return { store: next, commit: next.head!, act: done.act, blocks: done.blocks, bytes: done.bytes };
}

// What a commit says, apart from where it stands in a log: the act, the same in every
// store it touched, and in a line written before 2026-11-11.
const sayingOf = ({ at, blocks, gone, says }: Pick<Line, "at" | "blocks" | "gone" | "says">) =>
  canonical({ at, blocks, gone, says });

// The act a line is, named by its hash.
export const actHash = (line: Pick<Line, "at" | "blocks" | "gone" | "says">) => sha(sayingOf(line));

// Lands another copy's commits on this store: its blocks copied as they are, its log
// lines chained on again. Nothing in a block changes, so no id or reference does. A
// commit already landed here is known by what it says. Two copies that changed one
// holon stop here and ask.
export const land = (store: Store, other: Store) => locked([store], () => landed(store, other));

async function landed(store: Store, other: Store) {
  await mustBeCurrent(store);

  const ours = await store.fullLog();
  const theirs = await other.fullLog();

  if (ours.length === 0) throw new Error("an empty store takes a copy of the files, not a landing");

  let common = 0;
  while (common < ours.length && common < theirs.length && ours[common]!.hash === theirs[common]!.hash)
    common++;

  if (common === 0 && theirs.length) throw new Error("these copies share no history");

  const oursSince = ours.slice(common).map(({ line }) => line);
  const theirsSince = theirs.slice(common).map(({ line }) => line);
  const saidHere = new Set(oursSince.map(sayingOf));
  const saidThere = new Set(theirsSince.map(sayingOf));

  const onlyOurs = oursSince.filter((line) => !saidThere.has(sayingOf(line)));
  const incoming = theirsSince.filter((line) => !saidHere.has(sayingOf(line)));

  const changes = (line: Line) => [...ownBlocks(line).flatMap((block) => block.moved), ...goneIds(line.gone)];
  const moments = (line: Line) =>
    ownBlocks(line).flatMap((block) => (block.first ? [momentOf(block.first)] : []));

  const touched = new Set(onlyOurs.flatMap(changes));
  const minted = new Set(onlyOurs.flatMap(moments));

  for (const line of incoming) {
    for (const id of changes(line)) if (touched.has(id)) throw new Error(`both copies changed ${id}`);
    for (const moment of moments(line))
      if (minted.has(moment)) throw new Error(`both copies minted in the moment ${moment}`);
  }

  let at = store;

  for (const line of incoming) {
    for (const { hash } of ownBlocks(line)) {
      const bytes = await other.files.read(blockPath(hash));
      if (!bytes) throw new Error(`block ${hash} is missing from the other copy`);

      await store.files.write(blockPath(hash), bytes);
    }

    const { own, stores } = line;
    at = await (
      await writeLine(at, {
        at: line.at,
        blocks: line.blocks,
        gone: line.gone,
        says: line.says,
        ...(own && { own }),
        ...(stores && { stores }),
      })
    )();
  }

  return { landed: incoming.length, store: at };
}

// ---- An act cut short

// Finishes the act waiting past a store's ref by moving its ref to it: for the engine,
// once it knows every store the act names stands at it or waits for it.
export const finish = (store: Store) =>
  locked([store], async () => {
    await mustBeCurrent(store);

    const waiting = await store.pending();
    if (!waiting) throw new Error("no act waits past this store's ref");

    return moveRef(store, waiting.line, waiting.volume);
  });

// Takes out the act waiting past a store's ref, its volume replaced without it: for the
// engine, once it knows no store the act names moved to it.
export const drop = (store: Store) =>
  locked([store], async () => {
    await mustBeCurrent(store);

    const waiting = await store.pending();
    if (!waiting) throw new Error("no act waits past this store's ref");

    const kept =
      waiting.volume === store.volume && store.head ? await readLines(store.files, store.volume) : [];
    await store.files.replace(
      logPath(waiting.volume),
      kept
        .slice(0, store.openLines)
        .map((line) => `${line}\n`)
        .join(""),
    );

    return openStore(store.files, store.blocks);
  });
