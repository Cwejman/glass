// A store is where holons are kept and how they travel: plain files, read from
// a ref, that any static host can serve. vectors/README.md is the format in full.
//
//   refs/main           "<hash of the last log line> <open volume>"; written last
//   log/<n>.jsonl       commits, one per line; each volume opens with a checkpoint
//   blocks/<hash>.jsonl versions, one per line, about 64 KB to a block
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

export type Latest = { block: string; version: Version };

type BlockEntry = { first: string | null; hash: string; moved: string[]; new: number };

type Checkpoint = {
  blocks: [hash: string, first: string][];
  gone: string[];
  moved: [id: string, hash: string][];
};

type Line = {
  at: string;
  blocks: BlockEntry[];
  gone: string[];
  parent: string | null;
  says: string;
  checkpoint?: Checkpoint;
  conversion?: { blocks: string[] };
  held?: [id: string, place: number][];
  oldHash?: string;
};

// What a head holds: which block holds what. Never changed, only made anew.
type Table = {
  blocks: [hash: string, first: string][];
  moved: Map<string, string>;
  gone: Set<string>;
};

export type LogEntry = { hash: string; at: string; says: string };

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
  gone: Iterable<string>;
}): Table => ({
  blocks: [...blocks],
  moved: new Map(moved),
  gone: new Set(gone),
});

function apply(table: Table, line: Pick<Line, "blocks" | "gone">) {
  for (const block of line.blocks) {
    if (block.first) table.blocks.push([block.hash, block.first]);

    for (const id of block.moved) {
      table.moved.set(id, block.hash);
      table.gone.delete(id);
    }
  }

  for (const id of line.gone) table.gone.add(id);
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
  let found: [string, string] | undefined;

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

// Whether this head can hold an id at all, known without fetching anything: an id was
// minted in the moment of the block that holds it.
function mayHold(table: Table, id: string) {
  if (table.moved.has(id)) return true;

  const block = floor(table, id);
  return block !== undefined && momentOf(block[1]) === momentOf(id);
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
  let parent: string | null = null;

  for (const [i, text] of lines.entries()) {
    const line: Line = JSON.parse(text);

    if (i > 0 && line.parent !== parent) throw new Error(`the log breaks at line ${i} of its open volume`);

    if (i === 0) {
      if (!line.checkpoint) throw new Error("the open log volume has no checkpoint");
      table = tableOf(line.checkpoint);
    } else {
      apply(table, line);
    }

    parent = await sha(text);

    if (parent === head) return { table: sortBlocks(table), length: i + 1 };
  }

  throw new Error("the ref names no line of its volume");
}

export type Store = Awaited<ReturnType<typeof openStore>>;

export async function openStore(files: Files, blocks = new Map<string, Promise<Map<string, Version>>>()) {
  const ref = await readRef(files);
  const opened = ref
    ? await tableFromVolume(await readLines(files, ref.volume), ref.head)
    : { table: emptyTable(), length: 0 };
  const { table, length: openLines } = opened;

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

    let parent: string | null = null;

    for (let volume = 0; volume <= ref.volume; volume++) {
      for (const text of await readLines(files, volume)) {
        const line: Line = JSON.parse(text);

        if (line.parent !== parent) throw new Error(`the log breaks in volume ${volume}`);

        parent = await sha(text);
        entries.push({ text, hash: parent, line });

        if (parent === ref.head) return entries;
      }
    }

    throw new Error("the ref is not a line of the log");
  }

  const log = async (): Promise<LogEntry[]> =>
    (await fullLog()).map(({ hash, line: { at, says } }) => ({ hash, at, says }));

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
      for (const id of line.gone) held.delete(id);
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

  return {
    files,
    blocks,
    head: ref?.head ?? null,
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
  };
}

// ---- Writing

// A store is a value, so one opened before another commit landed is out of date, and
// writing from it would lose that commit.
async function mustBeCurrent(store: Store) {
  const ref = await readRef(store.files);

  if ((ref?.head ?? null) !== store.head) throw new Error("the store moved since it was opened");
}

async function appendLine(store: Store, fields: Pick<Line, "at" | "blocks" | "gone" | "says">) {
  const open = store.head ? await readLines(store.files, store.volume) : [];
  const kept = open.slice(0, store.openLines);
  const grown = kept.slice(1).reduce((size, text) => size + encoded(text).length + 1, 0);
  const opensVolume = !store.head || grown >= blockSize;
  const volume = !store.head ? 0 : opensVolume ? store.volume + 1 : store.volume;
  const line: Line = { ...fields, parent: store.head };

  if (opensVolume) {
    const state = tableOf(store.table);
    apply(state, line);

    line.checkpoint = {
      blocks: sortBlocks(state).blocks,
      gone: [...state.gone].sort(),
      moved: [...state.moved].sort(byId(([id]) => id)),
    };
  }

  const text = canonical(line);

  // What a commit that never finished left past the ref is written over.
  if (opensVolume) await store.files.write(logPath(volume), `${text}\n`);
  else if (open.length > kept.length)
    await store.files.write(logPath(volume), `${[...kept, text].join("\n")}\n`);
  else await store.files.append(logPath(volume), `${text}\n`);

  await store.files.write("refs/main", `${await sha(text)} ${volume}\n`);

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

// Adds one commit and gives the store it made: each holon a new version pointing
// back at the block before. Nothing written before is touched, and the ref moves last.
export async function commit(
  store: Store,
  { holons, says, at = new Date().toISOString(), gone = [] }: Commit,
) {
  await mustBeCurrent(store);

  if (new Set(holons.map(({ id }) => id)).size !== holons.length)
    throw new Error("one holon is written twice in one commit");

  const places = await Promise.all(
    holons.map(async (holon) => ({ holon, was: await store.lastVersion(holon.id) })),
  );
  const born = places
    .filter(({ was }) => !was)
    .map(({ holon }) => holon)
    .sort(byId(({ id }) => id));
  const edited = places.filter(({ was }) => was);

  born.forEach(({ id }, i) => {
    if (i > 0 && id !== nextId(born[i - 1]!.id)) {
      throw new Error(`new ids are not one run: ${born[i - 1]!.id} then ${id}`);
    }
  });

  if (born.length && mayHold(store.table, born[0]!.id)) {
    throw new Error(`another commit holds the moment of ${born[0]!.id}: mint again`);
  }

  const lines = [
    ...born.map((holon) => ({ id: holon.id, isNew: true, text: canonical({ ...holon, prev: null }) })),
    ...edited.map(({ holon, was }) => ({
      id: holon.id,
      isNew: false,
      text: canonical({ ...holon, prev: was!.block }),
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

  const taken = (await Promise.all(gone.map(async (id) => ((await store.read(id)) ? id : null))))
    .filter((id): id is string => id !== null)
    .sort();

  const next = await appendLine(store, { at, blocks: entries, gone: taken, says });

  return { store: next, commit: next.head!, blocks: entries.length, bytes };
}

// What a commit says, apart from where it stands in a log.
const sayingOf = ({ at, blocks, gone, says }: Line) => canonical({ at, blocks, gone, says });

// Lands another copy's commits on this store: its blocks copied as they are, its log
// lines chained on again. Nothing in a block changes, so no id or reference does. A
// commit already landed here is known by what it says. Two copies that changed one
// holon stop here and ask.
export async function land(store: Store, other: Store) {
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

  const changes = (line: Line) => [...line.blocks.flatMap((block) => block.moved), ...line.gone];
  const moments = (line: Line) =>
    line.blocks.flatMap((block) => (block.first ? [momentOf(block.first)] : []));

  const touched = new Set(onlyOurs.flatMap(changes));
  const minted = new Set(onlyOurs.flatMap(moments));

  for (const line of incoming) {
    for (const id of changes(line)) if (touched.has(id)) throw new Error(`both copies changed ${id}`);
    for (const moment of moments(line))
      if (minted.has(moment)) throw new Error(`both copies minted in the moment ${moment}`);
  }

  let at = store;

  for (const line of incoming) {
    for (const { hash } of line.blocks) {
      const bytes = await other.files.read(blockPath(hash));
      if (!bytes) throw new Error(`block ${hash} is missing from the other copy`);

      await store.files.write(blockPath(hash), bytes);
    }

    at = await appendLine(at, { at: line.at, blocks: line.blocks, gone: line.gone, says: line.says });
  }

  return { landed: incoming.length, store: at };
}
